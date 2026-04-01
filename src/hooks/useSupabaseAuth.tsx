/**
 * 📧 SISTEMA DE AUTENTICAÇÃO COM EMAILJS
 * 
 * Este hook gerencia toda a autenticação do sistema, incluindo:
 * - Login e logout de usuários
 * - Criação de novos usuários pelos administradores
 * - Envio automático de emails via EmailJS
 * - Proteção de sessão durante operações administrativas
 * - Gerenciamento de permissões e papéis
 *
 * PRINCIPAIS FUNCIONALIDADES:
 * ✅ Criação segura de usuários sem afetar sessão do admin
 * ✅ Envio automático de credenciais via EmailJS
 * ✅ Tratamento de conflitos de usuários órfãos
 * ✅ Validação rigorosa de dados de entrada
 * ✅ Logs detalhados para debugging
 * ✅ Fallback em caso de falha no envio de email
 * 
 * @author Rockfeller Navegantes - 2025
 */

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@/types/user';
import { useToast } from '@/hooks/use-toast';
import { validateEmail, validatePassword, validateName, sanitizeInput, generateSecurePassword } from '@/utils/inputValidation';
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG, APP_NAME } from '../constants/app';

// 🔧 INICIALIZAÇÃO: Configurar EmailJS na importação do módulo
emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);

interface AuthContextType {
  currentUser: User | null;
  authUser: SupabaseUser | null;
  session: Session | null;
  login: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => Promise<void>;
  createUser: (userData: { name: string; email: string; role: User['role'] }) => Promise<boolean>;
  updateUser: (userId: string, userData: { name: string; email: string; role?: User['role'] }) => Promise<boolean>;
  hasPermission: (requiredRole: User['role']) => boolean;
  canAccessUserManagement: () => boolean;
  canEditTaskDueDate: () => boolean;
  getAllUsers: () => Promise<User[]>;
  getVisibleUsers: () => Promise<User[]>;
  refreshProfile: () => Promise<void>;
  changePassword: (userId: string, newPassword: string) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  toggleUserStatus: (userId: string) => Promise<boolean>;
  needsPasswordChange: boolean;
  firstTimePasswordChange: (newPassword: string) => Promise<boolean>;
  loading: boolean;
  // 🔄 NOVO: Função para recuperar senha
  resendTemporaryPassword: (email: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hierarquia de permissões
const roleHierarchy = {
  admin: 7,
  franqueado: 6,
  supervisor_adm: 5,
  coordenador: 4,
  assessora_adm: 3,
  professor: 2,
  vendedor: 1
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    /**
     * 🎧 LISTENER DE AUTENTICAÇÃO 
     * 
     * Este listener monitora mudanças no estado de autenticação do Supabase.
     * É fundamental para manter a sessão do administrador durante criação de usuários.
     * 
     * PROTEÇÃO IMPLEMENTADA:
     * - Ignora mudanças quando isCreatingUser = true
     * - Evita logout acidental do administrador
     * - Mantém contexto correto durante operações
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, 'Creating user:', isCreatingUser);
        
        // 🔒 PROTEÇÃO: Ignorar mudanças de estado durante criação de usuário
        if (isCreatingUser) {
          console.log('Ignorando mudança de estado durante criação de usuário');
          return;
        }
        
        // ✅ NORMAL: Processar mudanças de autenticação normalmente
        setSession(session);
        setAuthUser(session?.user ?? null);
        
        if (session?.user) {
          // 👤 PERFIL: Buscar dados do usuário com delay para evitar race conditions
          setTimeout(() => {
            fetchUserProfile(session.user.id);
          }, 100);
        } else {
          // 🚪 LOGOUT: Limpar dados do usuário
          setCurrentUser(null);
        }
        
        setLoading(false);
      }
    );

    // 🔄 INICIALIZAÇÃO: Verificar se já existe sessão ativa
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isCreatingUser) {
      setSession(session);
      setAuthUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
        }
      }
    });

    // 🧹 CLEANUP: Remover listener quando componente for desmontado
    return () => subscription.unsubscribe();
  }, [isCreatingUser]); // Dependência: Recriar listener quando flag de criação mudar

  /**
   * 👤 BUSCAR PERFIL DO USUÁRIO
   * 
   * Função responsável por buscar os dados do perfil do usuário no banco.
   * Inclui proteção para evitar interferência durante criação de novos usuários.
   * 
   * @param userId - ID do usuário para buscar o perfil
   */
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('🔍 fetchUserProfile called for userId:', userId, 'isCreatingUser:', isCreatingUser);
      
      // 🔒 PROTEÇÃO: Não buscar perfil durante criação de usuário
      if (isCreatingUser) {
        console.log('⚠️ Ignorando fetchUserProfile durante criação de usuário');
        return;
      }
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.log('❌ Erro ao buscar perfil:', error);
        // Se o perfil não existir, tentar criar um básico
        if (error.code === 'PGRST116') {
          const { data: authData } = await supabase.auth.getUser();
          if (authData.user) {
            const { error: insertError } = await supabase
              .from('user_profiles')
              .insert({
                user_id: userId,
                name: authData.user.user_metadata?.full_name || authData.user.email || 'Usuário',
                email: authData.user.email || '',
                role: 'vendedor',
                is_active: true,
                first_login_completed: true // Usuários criados manualmente já passaram pelo primeiro login
              });
            
            if (!insertError) {
              // Tentar buscar novamente após criar
              setTimeout(() => fetchUserProfile(userId), 500);
            }
          }
        }
        return;
      }

      if (data) {
        console.log('✅ Perfil encontrado:', data.name, 'first_login_completed:', (data as any).first_login_completed);
        
        const userProfile: User = {
          id: data.id as string,
          user_id: data.user_id as string,
          name: data.name as string,
          email: data.email as string,
          role: data.role as User['role'],
          is_active: data.is_active as boolean,
          password_hash: data.password_hash as string,
          created_at: new Date(data.created_at as string),
          last_login: data.last_login ? new Date(data.last_login as string) : undefined,
          first_login_completed: (data as any).first_login_completed as boolean
        };
        
        setCurrentUser(userProfile);
        const needsChange = !(data as any).first_login_completed;
        console.log('🔐 Setting needsPasswordChange to:', needsChange);
        setNeedsPasswordChange(needsChange);
        
        // Atualizar último login
        await supabase
          .from('user_profiles')
          .update({ last_login: new Date().toISOString() })
          .eq('user_id', userId);
      }
    } catch (error) {
      console.error('Erro ao buscar perfil do usuário:', error);
    }
  };

  const refreshProfile = async () => {
    if (authUser) {
      await fetchUserProfile(authUser.id);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Validate input
      if (!validateEmail(email)) {
        toast({
          title: "Erro no Login",
          description: "Por favor, insira um email válido",
          variant: "destructive"
        });
        return false;
      }

      if (!password || password.length < 6) {
        toast({
          title: "Erro no Login",
          description: "Senha deve ter pelo menos 6 caracteres",
          variant: "destructive"
        });
        return false;
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: sanitizeInput(email),
        password
      });

      if (error) {
        toast({
          title: "Erro no Login",
          description: "Credenciais inválidas. Verifique seu email e senha.",
          variant: "destructive"
        });
        return false;
      }

      // ✅ VERIFICAR SE USUÁRIO ESTÁ ATIVO
      if (data.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('is_active')
          .eq('user_id', data.user.id)
          .single();

        if (profileError) {
          console.error('Erro ao verificar status do usuário:', profileError);
          toast({
            title: "Erro no Login",
            description: "Erro ao verificar status da conta. Tente novamente.",
            variant: "destructive"
          });
          return false;
        }

        if (profileData && profileData.is_active === false) {
          // 🔒 USUÁRIO DESATIVADO - Fazer logout e mostrar erro
          await supabase.auth.signOut();
          toast({
            title: "Conta Desativada",
            description: "Sua conta foi desativada. Entre em contato com o administrador.",
            variant: "destructive"
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Erro no login:', error);
      return false;
    }
  };

  const signUp = async (email: string, password: string, name: string): Promise<boolean> => {
    try {
      // Validate inputs
      if (!validateEmail(email)) {
        toast({
          title: "Erro no Cadastro",
          description: "Por favor, insira um email válido",
          variant: "destructive"
        });
        return false;
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
          toast({
            title: "Erro no Cadastro",
          description: passwordValidation.message,
            variant: "destructive"
          });
          return false;
        }

      if (!validateName(name)) {
              toast({
          title: "Erro no Cadastro",
          description: "Nome deve ter entre 2 e 100 caracteres",
          variant: "destructive"
              });
        return false;
        }

        const { data, error } = await supabase.auth.signUp({
        email: sanitizeInput(email),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
            full_name: sanitizeInput(name)
          }
          }
        });

        if (error) {
          toast({
            title: "Erro no Cadastro",
            description: error.message,
            variant: "destructive"
          });
          return false;
        }

        if (data.user && !data.session) {
          toast({
            title: "Verifique seu Email",
            description: "Foi enviado um link de confirmação para seu email.",
          });
        }

        return true;
    } catch (error) {
      console.error('Erro no cadastro:', error);
      return false;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setAuthUser(null);
    setSession(null);
  };

  /**
   * ✨ FUNÇÃO PRINCIPAL - CRIAR USUÁRIO
   *
   * Usa a Edge Function create-user que emprega o Admin API do Supabase.
   * Vantagens sobre signUp():
   * - Confirma o email automaticamente (email_confirm: true)
   * - Não afeta a sessão do administrador
   * - Usa service role key no servidor, sem expor no cliente
   *
   * @param userData - Dados do usuário (nome, email, papel)
   * @returns Promise<boolean> - true se criado com sucesso
   */
  const createUser = async (userData: { name: string; email: string; role: User['role'] }): Promise<boolean> => {
    try {
      if (!validateEmail(userData.email)) {
        toast({
          title: "Erro",
          description: "Por favor, insira um email válido",
          variant: "destructive"
        });
        return false;
      }

      if (!validateName(userData.name)) {
        toast({
          title: "Erro",
          description: "Nome deve ter entre 2 e 100 caracteres",
          variant: "destructive"
        });
        return false;
      }

      const securePassword = generateSecurePassword();

      // Criar usuário via Edge Function (Admin API, email confirmado automaticamente)
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-user', {
        body: {
          name: sanitizeInput(userData.name),
          email: sanitizeInput(userData.email),
          role: userData.role,
          password: securePassword
        }
      });

      if (fnError || !fnData?.success) {
        const message = fnData?.error || fnError?.message || 'Falha ao criar usuário';
        toast({
          title: "Erro",
          description: message,
          variant: "destructive"
        });
        return false;
      }

      // 📧 EMAIL: Enviar credenciais via EmailJS para o novo usuário
      try {
        console.log('🚀 Iniciando processo de envio de email...');
        
        // 🔍 DIAGNÓSTICO: Verificar se EmailJS está disponível e funcionando
        console.log('📧 Verificando EmailJS...', {
          emailjs: typeof emailjs,
          init: typeof emailjs.init,
          send: typeof emailjs.send
        });
        
        // ⚙️ CONFIGURAÇÕES: Verificar se todas as credenciais estão presentes
        console.log('📧 Configurações do EmailJS:', {
          SERVICE_ID: EMAILJS_CONFIG.SERVICE_ID,
          TEMPLATE_ID: EMAILJS_CONFIG.TEMPLATE_ID,
          PUBLIC_KEY: EMAILJS_CONFIG.PUBLIC_KEY ? '***' + EMAILJS_CONFIG.PUBLIC_KEY.slice(-4) : 'UNDEFINED'
        });

        // ✅ VALIDAÇÃO: Garantir que nenhuma configuração está vazia
        if (!EMAILJS_CONFIG.SERVICE_ID || !EMAILJS_CONFIG.TEMPLATE_ID || !EMAILJS_CONFIG.PUBLIC_KEY) {
          throw new Error('Configurações do EmailJS incompletas');
        }

        // 🔄 SEGURANÇA: Reinicializar EmailJS para garantir configuração correta
        console.log('🔄 Reinicializando EmailJS...');
        emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
        
        // 📝 PARÂMETROS: Preparar dados para o template de email
        const templateParams = {
          app_name: APP_NAME,               // Nome da aplicação
          user_name: userData.name,         // Nome do novo usuário
          user_email: userData.email,       // Email do destinatário  
          email: userData.email,            // Duplicado para compatibilidade com template
          temp_password: securePassword,    // Senha temporária gerada
          user_role: userData.role,         // Papel/função do usuário
          app_url: window.location.origin   // URL para acessar o sistema
        };

        console.log('📝 Parâmetros do template:', {
          app_name: templateParams.app_name,
          user_name: templateParams.user_name,
          user_email: templateParams.user_email,
          temp_password: '***' + templateParams.temp_password.slice(-4),
          user_role: templateParams.user_role,
          app_url: templateParams.app_url
        });

        console.log('📤 Iniciando envio do email...');
        
        // 🚀 ENVIO: Executar chamada para EmailJS com timeout para evitar travamentos
        const emailPromise = emailjs.send(
          EMAILJS_CONFIG.SERVICE_ID,
          EMAILJS_CONFIG.TEMPLATE_ID,
          templateParams,
          EMAILJS_CONFIG.PUBLIC_KEY
        );

        // ⏱️ TIMEOUT: Cancelar após 30 segundos se não houver resposta
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout ao enviar email')), 30000);
        });

        // 🏃 CORRIDA: Primeira resposta (email ou timeout) vence
        const response = await Promise.race([emailPromise, timeoutPromise]);

        // ✅ SUCESSO: Log detalhado da resposta do EmailJS
        console.log('✅ Email enviado com sucesso!', response);
        console.log('📊 Status da resposta:', (response as any).status);
        console.log('📝 Texto da resposta:', (response as any).text);
        
        // 🎉 FEEDBACK: Notificar administrador do sucesso
      toast({
          title: "Usuário Criado com Sucesso!",
          description: `${userData.name} foi criado e um email com as credenciais foi enviado para ${userData.email}`,
        });
      } catch (emailError: any) {
        // ❌ ERRO EMAIL: Capturar e analisar falhas no envio de email
        console.error('❌ Erro ao enviar email:', emailError);
        console.error('🔍 Detalhes completos do erro:', {
          message: emailError?.message || 'Erro desconhecido',
          text: emailError?.text || 'Texto não disponível',
          status: emailError?.status || 'Status não disponível',
          name: emailError?.name || 'Nome não disponível',
          stack: emailError?.stack || 'Stack não disponível',
          type: typeof emailError,
          constructor: emailError?.constructor?.name
        });
        
        // 🔍 DIAGNÓSTICO: Tentar identificar tipo específico de problema
        if (emailError?.message?.includes('network')) {
          console.error('🌐 Problema de rede detectado');
        } else if (emailError?.message?.includes('timeout')) {
          console.error('⏱️ Timeout detectado');
        } else if (emailError?.status === 422) {
          console.error('📧 Problema com parâmetros do template');
        } else if (emailError?.status === 400) {
          console.error('🔑 Problema com credenciais ou configuração');
        }
        
        // 🚨 FALLBACK: Usuário foi criado mas email falhou - mostrar senha no toast
        toast({
          title: "Usuário Criado - Email Falhou",
          description: `${userData.name} foi criado com sucesso! ⚠️ Erro no email: ${emailError?.message || 'Desconhecido'} - Senha temporária: ${securePassword}`,
          variant: "default"
        });
      }

      return true;
    } catch (error) {
      console.error('Erro geral ao criar usuário:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao criar usuário",
        variant: "destructive"
      });
      return false;
    }
  };

  const updateUser = async (userId: string, userData: { name: string; email: string; role?: User['role'] }): Promise<boolean> => {
    try {
      const { name, email, role } = userData;

      if (!validateName(name)) {
        toast({
          title: "Erro",
          description: "Nome deve ter entre 2 e 100 caracteres",
          variant: "destructive"
        });
        return false;
      }

      if (!validateEmail(email)) {
        toast({
          title: "Erro",
          description: "Por favor, insira um email válido",
          variant: "destructive"
        });
        return false;
      }

      // Atualizar via Edge Function (usa service role, ignora RLS)
      const { data: fnData, error: fnError } = await supabase.functions.invoke('update-user', {
        body: {
          userId,
          name: sanitizeInput(name),
          email: sanitizeInput(email),
          ...(role ? { role } : {})
        }
      });

      if (fnError || !fnData?.success) {
        const message = fnData?.error || fnError?.message || 'Falha ao atualizar usuário';
        console.error('Erro ao atualizar usuário:', message);
        toast({
          title: "Erro",
          description: message,
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Sucesso",
        description: "Usuário atualizado com sucesso",
      });

      return true;
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao atualizar usuário",
        variant: "destructive"
      });
      return false;
    }
  };

  const getAllUsers = async (): Promise<User[]> => {
    try {
      if (!canAccessUserManagement()) {
        toast({
          title: "Erro",
          description: "Você não tem permissão para acessar esta funcionalidade.",
          variant: "destructive"
        });
        return [];
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('is_active', true) // ✅ FILTRAR APENAS USUÁRIOS ATIVOS
        .order('name', { ascending: true });

      if (error) {
        console.error('Erro ao buscar usuários:', error);
        toast({
          title: "Erro",
          description: "Falha ao buscar usuários",
          variant: "destructive"
        });
        return [];
      }

      return (data || []).map((user: any) => ({
        id: user.id as string,
        user_id: user.user_id as string,
        name: user.name as string,
        email: user.email as string,
        role: user.role as User['role'],
        is_active: user.is_active as boolean,
        password_hash: user.password_hash as string,
        created_at: new Date(user.created_at as string),
        last_login: user.last_login ? new Date(user.last_login as string) : undefined,
        first_login_completed: (user as any).first_login_completed as boolean
      }));
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao buscar usuários",
        variant: "destructive"
      });
      return [];
    }
  };

  const getVisibleUsers = async (): Promise<User[]> => {
    try {
      if (!currentUser) return [];

      // Usar a função do banco de dados que retorna todos os usuários ativos
      // Isso permite que qualquer usuário possa atribuir tarefas a qualquer outro usuário
      const { data, error } = await supabase
        .rpc('get_visible_users_for_role' as any, { user_role: currentUser.role });

      if (error) {
        console.error('Erro ao buscar usuários visíveis:', error);
        // Fallback para query direta se a função falhar
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('is_active', true) // ✅ FILTRAR APENAS USUÁRIOS ATIVOS
          .order('name', { ascending: true });
        
        if (fallbackError) {
          console.error('Erro no fallback:', fallbackError);
          return [];
        }
        
        return (fallbackData || []).map((user: any) => ({
          id: user.id as string,
          user_id: user.user_id as string,
          name: user.name as string,
          email: user.email as string,
          role: user.role as User['role'],
          is_active: user.is_active as boolean,
          password_hash: user.password_hash as string,
          created_at: new Date(user.created_at as string),
          last_login: user.last_login ? new Date(user.last_login as string) : undefined
        }));
      }

      // ✅ FILTRAR APENAS USUÁRIOS ATIVOS da função RPC
      // A função RPC já deve filtrar por is_active = true, mas vamos garantir
      const activeUsers = (data || []).filter((user: any) => {
        // Se a função RPC retorna is_active, usar esse valor
        if (user.hasOwnProperty('is_active')) {
          return user.is_active !== false;
        }
        // Se não retorna is_active, assumir que são todos ativos (comportamento padrão da RPC)
        return true;
      });
      
      return activeUsers.map((user: any) => ({
        id: user.id || user.user_id, // Fallback para compatibilidade
        user_id: user.user_id as string,
        name: user.name as string,
        email: user.email as string,
        role: user.role as User['role'],
        is_active: true, // Todos os usuários retornados pela RPC são ativos
        password_hash: '', // Não retornado pela RPC
        created_at: new Date(), // Não retornado pela RPC
        last_login: undefined // Não retornado pela RPC
      }));
    } catch (error) {
      console.error('Erro ao buscar usuários visíveis:', error);
      return [];
    }
  };

  const changePassword = async (userId: string, newPassword: string): Promise<boolean> => {
    try {
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        toast({
          title: "Erro",
          description: passwordValidation.message,
          variant: "destructive"
        });
        return false;
      }

      const { data, error } = await supabase.functions.invoke('change-user-password', {
        body: { userId, newPassword }
      });

      if (error) {
        toast({
          title: "Erro",
          description: "Falha ao alterar senha",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Sucesso",
        description: "Senha alterada com sucesso",
      });

      return true;
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao alterar senha",
        variant: "destructive"
      });
      return false;
    }
  };

  const deleteUser = async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });

      if (error) {
        toast({
          title: "Erro",
          description: "Falha ao excluir usuário",
          variant: "destructive"
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Erro ao excluir usuário:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao excluir usuário",
        variant: "destructive"
      });
      return false;
    }
  };

  const toggleUserStatus = async (userId: string): Promise<boolean> => {
    try {
      // Buscar usuário atual
      const { data: userData, error: fetchError } = await supabase
        .from('user_profiles')
        .select('is_active')
        .eq('id', userId)
        .single();

      if (fetchError) {
        console.error('Erro ao buscar usuário:', fetchError);
        return false;
      }

      // ✅ ALTERNAR STATUS: Se está ativo, desativar; se está inativo, ativar
      const newStatus = !(userData as any).is_active;
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: newStatus })
        .eq('id', userId);

      if (error) {
        toast({
          title: "Erro",
          description: error.message,
          variant: "destructive"
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      return false;
    }
  };

  const hasPermission = (requiredRole: User['role']): boolean => {
    if (!currentUser) return false;
    
    const userLevel = roleHierarchy[currentUser.role];
    const requiredLevel = roleHierarchy[requiredRole];
    
    return userLevel >= requiredLevel;
  };

  const canAccessUserManagement = (): boolean => {
    return hasPermission('franqueado');
  };

  /**
   * 🔒 VERIFICA PERMISSÃO PARA EDIÇÃO DE DATAS DE PRAZO
   * 
   * Esta função verifica se o usuário atual tem permissão para editar
   * datas de prazo de tarefas existentes.
   * 
   * REGRAS DE NEGÓCIO:
   * - Admin: ✅ Pode editar datas de prazo (nível máximo)
   * - Franqueado: ✅ Pode editar datas de prazo (nível elevado)
   * - Supervisor ADM: ✅ Pode editar datas de prazo (nível gerencial)
   * - Coordenador: ❌ Não pode editar datas de prazo
   * - Assessora ADM: ❌ Não pode editar datas de prazo
   * - Professor: ❌ Não pode editar datas de prazo
   * - Vendedor: ❌ Não pode editar datas de prazo
   * 
   * JUSTIFICATIVA:
   * A alteração de prazos é uma operação crítica que pode impactar
   * o planejamento da equipe. Apenas usuários com responsabilidades
   * gerenciais devem ter essa permissão.
   * 
   * @returns boolean - true se usuário pode editar datas de prazo de tarefas existentes
   * 
   * @example
   * // Usuário admin pode editar
   * if (canEditTaskDueDate()) {
   *   // Habilitar campos de data/hora
   * }
   * 
   * // Usuário vendedor não pode editar
   * if (!canEditTaskDueDate()) {
   *   // Desabilitar campos e mostrar mensagem
   * }
   */
  const canEditTaskDueDate = (): boolean => {
    if (!currentUser) return false;
    
    // Apenas admin, franqueado e supervisor_adm podem editar datas de prazo
    return ['admin', 'franqueado', 'supervisor_adm'].includes(currentUser.role);
  };

  const firstTimePasswordChange = async (newPassword: string): Promise<boolean> => {
    try {
      if (!currentUser) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive"
        });
        return false;
      }

      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        toast({
          title: "Erro",
          description: passwordValidation.message,
          variant: "destructive"
        });
        return false;
      }

      // Atualizar senha no Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (authError) {
        toast({
          title: "Erro",
          description: authError.message || "Erro ao alterar senha",
          variant: "destructive"
        });
        return false;
      }

      // Marcar first_login_completed como true
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ first_login_completed: true } as any)
        .eq('user_id', currentUser.user_id);

      if (profileError) {
        toast({
          title: "Erro",
          description: "Erro ao atualizar perfil",
          variant: "destructive"
        });
        return false;
      }

      setNeedsPasswordChange(false);
      await refreshProfile();

      toast({
        title: "Sucesso!",
        description: "Senha alterada com sucesso!",
      });

      return true;
    } catch (error) {
      console.error('Erro ao alterar senha no primeiro login:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao alterar senha",
        variant: "destructive"
      });
      return false;
    }
  };

  /**
   * 🔄 FUNÇÃO ESQUECI MINHA SENHA
   * 
   * Esta função implementa o fluxo completo de recuperação de senha:
   * 1. Verifica se o usuário existe no sistema
   * 2. Gera uma nova senha temporária segura
   * 3. Atualiza a senha no Supabase Auth
   * 4. Marca o usuário para trocar senha no primeiro login
   * 5. Envia email com as novas credenciais
   * 
   * @param email - Email do usuário que esqueceu a senha
   * @returns Promise<boolean> - true se o email foi enviado com sucesso
   */
  const resendTemporaryPassword = async (email: string): Promise<boolean> => {
    try {
      // ✅ VALIDAÇÃO: Verificar se o email é válido
      if (!validateEmail(email)) {
        toast({
          title: "Email inválido",
          description: "Por favor, insira um email válido",
          variant: "destructive"
        });
        return false;
      }

      // 🔍 VERIFICAR: Se o usuário existe no sistema
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('email', sanitizeInput(email))
        .single();

      if (profileError || !userProfile) {
        toast({
          title: "Usuário não encontrado",
          description: "Não foi possível encontrar um usuário com este email",
          variant: "destructive"
        });
        return false;
      }

      // 🔐 SEGURANÇA: Gerar nova senha temporária
      const newTemporaryPassword = generateSecurePassword();

      // 📧 PREPARAR: Dados para o email
      const userData = {
        name: userProfile.name,
        email: userProfile.email,
        role: userProfile.role
      };

      // 🔄 ATUALIZAR: Senha no Supabase Auth via Edge Function (Admin API)
      const { data: resetData, error: resetError } = await supabase.functions.invoke('reset-user-password', {
        body: {
          email: sanitizeInput(email),
          newPassword: newTemporaryPassword
        }
      });

      if (resetError || !resetData?.success) {
        const message = resetData?.error || resetError?.message || 'Falha ao redefinir senha';
        console.error('Erro ao redefinir senha:', message);
        toast({
          title: "Erro",
          description: message,
          variant: "destructive"
        });
        return false;
      }

      // 📧 ENVIAR: Email com nova senha temporária
      try {
        console.log('📧 Iniciando envio de email de recuperação de senha...');
        
        // Verificar configurações do EmailJS
        if (!EMAILJS_CONFIG.SERVICE_ID || !EMAILJS_CONFIG.TEMPLATE_ID || !EMAILJS_CONFIG.PUBLIC_KEY) {
          throw new Error('Configurações do EmailJS incompletas');
        }

        // Reinicializar EmailJS
        emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
        
        // Preparar parâmetros do template
        const templateParams = {
          app_name: APP_NAME,
          user_name: userData.name,
          user_email: userData.email,
          email: userData.email,
          temp_password: newTemporaryPassword,
          user_role: userData.role,
          app_url: window.location.origin,
          reset_type: 'password_reset' // Identificar que é recuperação de senha
        };

        console.log('📧 Enviando email de recuperação para:', userData.email);
        
        // Enviar email com timeout
        const emailPromise = emailjs.send(
          EMAILJS_CONFIG.SERVICE_ID,
          EMAILJS_CONFIG.TEMPLATE_ID, // Usar o mesmo template (ou criar um específico)
          templateParams,
          EMAILJS_CONFIG.PUBLIC_KEY
        );

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout ao enviar email')), 30000);
        });

        const response = await Promise.race([emailPromise, timeoutPromise]);
        
        console.log('✅ Email de recuperação enviado com sucesso!', response);
        
        toast({
          title: "✅ Email Enviado!",
          description: `Uma nova senha temporária foi enviada para ${userData.email}`,
          variant: "default"
        });

        return true;

      } catch (emailError) {
        console.error('❌ Erro ao enviar email de recuperação:', emailError);
        
        // Fallback: Mostrar a senha temporária no toast
        toast({
          title: "Email Falhou - Senha Temporária",
          description: `Falha no envio do email. Sua nova senha temporária: ${newTemporaryPassword}`,
          variant: "destructive"
        });
        
        return false;
      }

    } catch (error) {
      console.error('Erro geral ao recuperar senha:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao recuperar senha. Tente novamente.",
        variant: "destructive"
      });
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      authUser,
      session,
      login,
      signUp,
      logout,
      createUser,
      updateUser,
      hasPermission,
      canAccessUserManagement,
      canEditTaskDueDate,
      getAllUsers,
      getVisibleUsers,
      refreshProfile,
      changePassword,
      deleteUser,
      toggleUserStatus,
      needsPasswordChange,
      firstTimePasswordChange,
      loading,
      resendTemporaryPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useSupabaseAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useSupabaseAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
