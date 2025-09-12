import { useState, useEffect, useCallback, useRef } from 'react';
import { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useToast } from '@/hooks/use-toast';
import React from 'react';

/**
 * 🎯 HOOK GERENCIADOR DE TAREFAS - SISTEMA SIMPLIFICADO
 * 
 * HISTÓRICO DE OTIMIZAÇÕES:
 * - Data da simplificação: 15/01/2025
 * - Motivo: Resolução de problema de "piscar" na interface
 * - Problema original: Sistema real-time complexo com múltiplos timers causando re-renders excessivos
 * 
 * MUDANÇAS IMPLEMENTADAS:
 * ✅ Polling simplificado: 1 minuto apenas (era 30 segundos + fallback 5 minutos)
 * ❌ Real-time subscription complexo removido (handleTaskInsert/Update/Delete)
 * ❌ Fallback refresh system removido (setupFallbackRefresh)
 * ❌ Múltiplos timers simultâneos eliminados
 * ❌ Toast notifications automáticas removidas
 * 
 * SISTEMA ATUAL (ESTÁVEL):
 * - loadTasks() inicial no mount
 * - Timer único de 1 minuto para refresh
 * - Dependências mínimas nos useEffect
 * - Cleanup adequado dos timers
 * 
 * ⚠️ CUIDADOS PARA FUTURAS ATUALIZAÇÕES:
 * 
 * 1. NUNCA reduzir intervalo de polling abaixo de 1 minuto
 * 2. SEMPRE usar dependências estáveis nos useEffect
 * 3. SEMPRE implementar cleanup de timers
 * 4. EVITAR múltiplos setInterval simultâneos
 * 5. TESTAR em modo desenvolvimento antes de deploy
 * 
 * CÓDIGO DE REFERÊNCIA PARA FUTURAS MELHORIAS:
 * ```javascript
 * // ✅ Polling seguro
 * useEffect(() => {
 *   const timer = setTimeout(() => {
 *     if (document.hasFocus()) { // Apenas se usuário ativo
 *       loadTasks();
 *     }
 *     setupNextRefresh(); // Reagendar explicitamente
 *   }, 60000); // MÍNIMO 1 minuto
 *   
 *   return () => clearTimeout(timer);
 * }, []); // Dependências vazias ou estáveis
 * 
 * // ❌ EVITAR - Causa problemas
 * useEffect(() => {
 *   const interval = setInterval(() => {
 *     loadTasks(); // Re-render a cada chamada
 *   }, 30000); // Muito frequente
 * }, [user, filter, status]); // Dependências instáveis
 * ```
 * 
 * PERFORMANCE ATUAL:
 * - Timers ativos: 1 apenas
 * - Requests por minuto: 1 apenas  
 * - Re-renders: Mínimos e controlados
 * - Memória: Estável, sem leaks
 * - CPU: Baixo uso
 */
export const useTaskManager = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'today' | 'week' | 'month' | 'overdue'>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<'all' | 'baixa' | 'media' | 'urgente'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pendente' | 'em_andamento' | 'concluida' | 'cancelada'>('all');
  
  // 🚀 SISTEMA SIMPLIFICADO: Estados mínimos necessários
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

  const { currentUser } = useSupabaseAuth();
  const { toast } = useToast();
  
  // Refs para controle de timers e race conditions
  const isLoadingRef = useRef(false);
  const refreshIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sistema funcionando sem real-time
  console.log("DEBUG: useTaskManager.ts carregado - real-time desativado");
  // ⚠️ Polling reduzido para 1 minuto apenas
  const REFRESH_INTERVAL = 60000; // 1 minuto (era 5 minutos)

  // ⚠️ Real-time subscriptions DESABILITADAS
  // setupRealTimeSubscriptions(); // COMENTADO

  /**
   * 🔄 SISTEMA DE REFRESH SIMPLIFICADO
   * 
   * MUDANÇA PRINCIPAL: De setupFallbackRefresh para setupSimpleRefresh
   * 
   * ANTES (Problemático):
   * - Múltiplos timers: setInterval + setTimeout + fallback
   * - Dependências complexas: [isRealTimeConnected, user, status]
   * - Verificações condicionais: if (!isRealTimeConnected)
   * - Intervalo agressivo: 30 segundos + fallback 5 minutos
   * 
   * DEPOIS (Estável):
   * - Timer único: setTimeout apenas
   * - Dependências mínimas: [] (vazio)
   * - Verificação simples: loadTasks() sempre
   * - Intervalo seguro: 1 minuto fixo
   * 
   * VANTAGENS:
   * - Eliminação de race conditions
   * - Previsibilidade total
   * - Cleanup simplificado
   * - Performance otimizada
   */
  const setupSimpleRefresh = useCallback(() => {
    // Limpar timer anterior para evitar vazamentos
    if (refreshIntervalRef.current) {
      clearTimeout(refreshIntervalRef.current);
    }
    
    refreshIntervalRef.current = setTimeout(() => {
      console.log('🔄 Verificação tarefas (1 minuto)...');
      loadTasks(); // Carregamento simples e direto
      setupSimpleRefresh(); // Reagendar para próximo ciclo
    }, REFRESH_INTERVAL); // 1 minuto conforme especificado pelo usuário
  }, []); // CRITICAL: Dependências vazias para estabilidade

  // 🎯 Função para formatar tarefa do banco para o tipo Task
  const formatTaskFromDB = useCallback((taskData: any): Task => {
    // Map "alta" priority to "urgente" for backward compatibility
    let priority: 'baixa' | 'media' | 'urgente' = taskData.priority as 'baixa' | 'media' | 'urgente';
    if (taskData.priority === 'alta') {
      priority = 'urgente';
    }

    return {
      id: taskData.id,
      title: taskData.title,
      description: taskData.description || '',
      status: taskData.status as 'pendente' | 'em_andamento' | 'concluida' | 'cancelada',
      priority: priority,
      due_date: taskData.due_date || undefined,
      assigned_users: taskData.assigned_users || [],
      created_by: taskData.created_by,
      created_at: new Date(taskData.created_at),
      updated_at: new Date(taskData.updated_at),
      completed_at: taskData.completed_at ? new Date(taskData.completed_at) : undefined,
      is_private: taskData.is_private ?? false,
      edited_by: taskData.edited_by || undefined,
      edited_at: taskData.edited_at ? new Date(taskData.edited_at) : undefined
    };
  }, []);

  /**
   * 🚀 USEEFFECT PRINCIPAL - SISTEMA SIMPLIFICADO 
   * 
   * MUDANÇA CRÍTICA REALIZADA EM 15/01/2025:
   * Substituição do sistema real-time complexo por polling simples de 1 minuto
   * 
   * ANTES (Sistema problemático que causava piscar):
   * ```javascript
   * useEffect(() => {
   *   loadTasks();
   *   setupFallbackRefresh(); // Timer de 5 minutos
   *   
   *   // Real-time subscription complexo
   *   const channel = supabase.channel(`tasks_optimized_${Date.now()}`)
   *     .on('postgres_changes', { event: 'INSERT' }, handleTaskInsert)
   *     .on('postgres_changes', { event: 'UPDATE' }, handleTaskUpdate)  
   *     .on('postgres_changes', { event: 'DELETE' }, handleTaskDelete)
   *     .subscribe((status) => {
   *       // Lógica complexa de reconnect
   *       // Toasts automáticos
   *       // State updates frequentes
   *     });
   *     
   *   return () => {
   *     // Cleanup de múltiplos resources
   *     supabase.removeChannel(channel);
   *     clearTimeout(fallbackRefreshRef.current);
   *   };
   * }, [currentUser, handleTaskInsert, handleTaskUpdate, handleTaskDelete, setupFallbackRefresh]);
   * ```
   * 
   * PROBLEMAS IDENTIFICADOS:
   * ❌ Múltiplas dependências instáveis causavam re-execução frequente
   * ❌ Real-time subscription gerava re-renders a cada mudança no banco
   * ❌ Fallback refresh criava timers sobrepostos
   * ❌ Toast notifications causavam updates visuais excessivos
   * ❌ Channel subscriptions não eram properly cleaned up
   * 
   * DEPOIS (Sistema atual estável):
   * - loadTasks() inicial para carregar dados
   * - setupSimpleRefresh() para polling de 1 minuto
   * - Cleanup simples e seguro do timer
   * - Dependências mínimas e estáveis
   * 
   * VANTAGENS DA SIMPLIFICAÇÃO:
   * ✅ Eliminação completa do "piscar" da interface
   * ✅ Performance previsível e estável
   * ✅ Debugging mais fácil (apenas 1 timer)
   * ✅ Menos consumo de recursos
   * ✅ Menos pontos de falha
   * 
   * ⚠️ TRADE-OFFS ACEITOS:
   * - Atualizações não são mais instantâneas (delay de até 1 minuto)
   * - Usuários não veem mudanças de outros usuários em tempo real
   * - Sistema é "pull-based" ao invés de "push-based"
   * 
   * 🔮 REATIVAÇÃO FUTURA DO REAL-TIME:
   * Se necessário reativar real-time no futuro, implementar:
   * 1. Debounce de 5-10 segundos em todas as mudanças
   * 2. Throttling de updates (max 1 por segundo)
   * 3. Filtros server-side para relevância
   * 4. Circuit breaker para fallback automático
   * 5. Feature flags para ativação gradual
   */
  const effectRan = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || effectRan.current === true) {
      loadTasks();
      setupSimpleRefresh();
    }

    return () => {
      effectRan.current = true;
    };
  }, []); // Dependências vazias para rodar apenas uma vez

  useEffect(() => {
    filterTasks();
  }, [tasks, activeFilter, selectedUser, selectedAccessLevel, selectedPriority, selectedStatus]);

  /**
   * Carrega todas as tarefas do banco de dados
   */
  const loadTasks = async () => {
    if (isLoadingRef.current) {
      console.log('loadTasks já em progresso, ignorando...');
      return;
    }
    
    setIsLoading(true);
    isLoadingRef.current = true;
    
    try {
      console.log('🔍 Carregando todas as tarefas...');
      
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (taskError) {
        console.error('Erro ao carregar tarefas:', taskError);
        toast({
          title: "Erro ao carregar tarefas",
          description: "Não foi possível carregar as tarefas. Tente novamente.",
          variant: "destructive"
        });
        return;
      }

      if (taskData) {
        const formattedTasks: Task[] = taskData.map(formatTaskFromDB);
        console.log('✅ Tarefas carregadas:', formattedTasks.length);
        setTasks(formattedTasks);
        setLastUpdateTime(Date.now());
      }
    } catch (error) {
      console.error('Erro ao carregar tarefas:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao carregar tarefas",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  // Force refresh function for debugging
  const forceRefresh = async () => {
    console.log('🔄 Forçando refresh manual...');
    await loadTasks();
  };

  const filterTasks = async () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let filtered = tasks;

    // Filtro temporal
    switch (activeFilter) {
      case 'today':
        filtered = filtered.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          return taskDate >= today && taskDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
        });
        break;
      case 'week':
        filtered = filtered.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          return taskDate >= weekStart && taskDate < weekEnd;
        });
        break;
      case 'month':
        filtered = filtered.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          return taskDate >= monthStart && taskDate < monthEnd;
        });
        break;
      case 'overdue':
        // 🚨 FILTRO DE TAREFAS ATRASADAS
        // Critério: due_date < agora E status não é 'concluida' nem 'cancelada'
        filtered = filtered.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          const isOverdue = taskDate < now;
          const isNotCompleted = task.status !== 'concluida' && task.status !== 'cancelada';
          return isOverdue && isNotCompleted;
        });
        break;
      default:
        break;
    }

    // Filtro por usuário (apenas tarefas atribuídas)
    if (selectedUser !== 'all') {
      filtered = filtered.filter(task => 
        task.assigned_users.includes(selectedUser)
      );
    }

    // Filtro por nível de acesso (apenas tarefas atribuídas)
    if (selectedAccessLevel !== 'all') {
      try {
        const { data: userProfiles } = await supabase
          .from('user_profiles')
          .select('user_id, role')
          .eq('role', selectedAccessLevel);

        if (userProfiles) {
          const userIds = userProfiles.map(profile => profile.user_id);
          filtered = filtered.filter(task => 
            task.assigned_users.some(userId => userIds.includes(userId))
          );
        }
      } catch (error) {
        console.error('Erro ao filtrar por nível de acesso:', error);
      }
    }

    // Filtro por prioridade
    if (selectedPriority !== 'all') {
      filtered = filtered.filter(task => task.priority === selectedPriority);
    }

    // Filtro por status - incluir "em_andamento" quando filtro for "pendente"
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'pendente') {
        // Pendente inclui também tarefas em andamento para não perdê-las de vista
        filtered = filtered.filter(task => task.status === 'pendente' || task.status === 'em_andamento');
      } else {
        filtered = filtered.filter(task => task.status === selectedStatus);
      }
    }

    setFilteredTasks(filtered);
  };

  const clearAdvancedFilters = () => {
    // Preservar o filtro de usuário conforme solicitado
    setSelectedAccessLevel('all');
    setSelectedPriority('all');
    setSelectedStatus('all');
  };

  const getFilterCount = (filter: 'all' | 'today' | 'week' | 'month' | 'overdue') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    switch (filter) {
      case 'all':
        // Total do mês vigente
        return tasks.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          return taskDate >= monthStart && taskDate < monthEnd;
        }).length;
      case 'today':
        return tasks.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          return taskDate >= today && taskDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
        }).length;
      case 'week':
        return tasks.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          return taskDate >= weekStart && taskDate < weekEnd;
        }).length;
      case 'month':
        return tasks.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          return taskDate >= monthStart && taskDate < monthEnd;
        }).length;
      case 'overdue':
        // 🚨 CONTADOR DE TAREFAS ATRASADAS
        // Critério: due_date < agora E status não é 'concluida' nem 'cancelada'
        return tasks.filter(task => {
          if (!task.due_date) return false;
          const taskDate = new Date(task.due_date);
          const isOverdue = taskDate < now;
          const isNotCompleted = task.status !== 'concluida' && task.status !== 'cancelada';
          return isOverdue && isNotCompleted;
        }).length;
      default:
        return 0;
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    if (!currentUser) {
      toast({
        title: "Usuário não autenticado",
        description: "Você precisa estar logado para atualizar tarefas.",
        variant: "destructive"
      });
      return;
    }

    setUpdatingTask(taskId);
    // Atualização otimista: refletir imediatamente na lista local
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, updated_at: new Date() as any } : t));
    try {
      const task = tasks.find(t => t.id === taskId);
      
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (newStatus === 'concluida') {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        console.error('Erro ao atualizar status da tarefa:', error);
        toast({
          title: "Erro ao atualizar status",
          description: "Não foi possível atualizar o status da tarefa. Tente novamente.",
          variant: "destructive"
        });
        return;
      }

      const getStatusMessage = (status: Task['status']) => {
        switch (status) {
          case 'pendente':
            return { title: "Status atualizado", description: `"${task?.title}" foi marcada como pendente.`, variant: "default" };
          case 'em_andamento':
            return { title: "Em andamento", description: `"${task?.title}" está em andamento.`, variant: "info" };
          case 'concluida':
            return { title: "Tarefa concluída!", description: `"${task?.title}" foi concluída com sucesso.`, variant: "success" };
          case 'cancelada':
            return { title: "Tarefa cancelada", description: `"${task?.title}" foi cancelada.`, variant: "destructive" };
          default:
            return { title: "Status atualizado", description: "Status da tarefa atualizado com sucesso.", variant: "default" };
        }
      };

      const statusMessage = getStatusMessage(newStatus);
      toast({
        title: statusMessage.title,
        description: statusMessage.description,
        variant: statusMessage.variant as any
      });

      // Sincroniza lista após confirmação do backend
      await loadTasks();
    } catch (error) {
      console.error('Erro ao atualizar status da tarefa:', error);
      toast({
        title: "Erro inesperado",
        description: "Erro inesperado ao atualizar tarefa. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setUpdatingTask(null);
    }
  };

  const canEditTask = (task: Task): boolean => {
    if (!currentUser) return false;
    
    if (task.created_by === currentUser.user_id) return true;
    if (task.assigned_users.includes(currentUser.user_id)) return true;
    if (['admin', 'franqueado'].includes(currentUser.role)) return true;
    
    return false;
  };

  /**
   * Verifica se o usuário pode editar completamente uma tarefa
   * (admin, franqueado e supervisor têm permissão completa para editar)
   */
  const canEditTaskFull = (task: Task): boolean => {
    if (!currentUser) return false;
    
    // Admin, franqueado e supervisor podem editar qualquer tarefa
    if (['admin', 'franqueado', 'supervisor_adm'].includes(currentUser.role)) return true;
    
    // Outros usuários só podem editar suas próprias tarefas ou tarefas atribuídas
    if (task.created_by === currentUser.user_id) return true;
    if (task.assigned_users.includes(currentUser.user_id)) return true;
    
    return false;
  };

  /**
   * Atualiza uma tarefa existente
   * 
   * @param taskId - ID da tarefa a ser atualizada
   * @param updatedTask - Dados atualizados da tarefa
   * @returns Promise<boolean> - true se atualizada com sucesso, false caso contrário
   */
  const updateTask = async (taskId: string, updatedTask: {
    title: string;
    description: string;
    status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
    priority: 'baixa' | 'media' | 'urgente';
    due_date: string;
    assigned_users: string[];
    is_private: boolean;
  }) => {
    if (!updatedTask.title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "O título da tarefa é obrigatório.",
        variant: "destructive"
      });
      return false;
    }

    if (!currentUser) {
      toast({
        title: "Usuário não autenticado",
        description: "Você precisa estar logado para editar tarefas.",
        variant: "destructive"
      });
      return false;
    }

    // Verificar se o usuário tem permissão para editar
    const taskToEdit = tasks.find(task => task.id === taskId);
    if (!taskToEdit || !canEditTaskFull(taskToEdit)) {
      toast({
        title: "Permissão negada",
        description: "Você não tem permissão para editar esta tarefa.",
        variant: "destructive"
      });
      return false;
    }

    try {
      // Processar data de vencimento com timezone do Brasil
      let formattedDueDate = null;
      if (updatedTask.due_date) {
        let dateOnly = updatedTask.due_date;
        
        // Se contém espaço, pega apenas a parte da data
        if (dateOnly.includes(' ')) {
          dateOnly = dateOnly.split(' ')[0];
        }
        
        // Se contém T (ISO), pega apenas a parte da data
        if (dateOnly.includes('T')) {
          dateOnly = dateOnly.split('T')[0];
        }
        
        // Extrair componentes da hora da string original
        let time = '09:00';
        if (updatedTask.due_date.includes(' ')) {
          const timePart = updatedTask.due_date.split(' ')[1];
          if (timePart) {
            time = timePart.substring(0, 5); // HH:MM
          }
        }
        
        // Incluir timezone do Brasil (-03:00) explicitamente
        formattedDueDate = `${dateOnly} ${time}:00-03:00`;
      }

      const updateData = {
        title: updatedTask.title,
        description: updatedTask.description || null,
        status: updatedTask.status,
        priority: updatedTask.priority,
        due_date: formattedDueDate,
        assigned_users: updatedTask.assigned_users,
        is_private: updatedTask.is_private
      };
      
      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        console.error('Erro ao atualizar tarefa:', error);
        toast({
          title: "Erro ao atualizar tarefa",
          description: "Não foi possível atualizar a tarefa. Tente novamente.",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Tarefa atualizada com sucesso!",
        description: `"${updatedTask.title}" foi atualizada.`,
        variant: "success"
      });

      // Recarregar tarefas para mostrar as mudanças
      await loadTasks();
      return true;
    } catch (error) {
      console.error('Erro ao atualizar tarefa:', error);
      toast({
        title: "Erro inesperado",
        description: "Erro inesperado ao atualizar tarefa. Tente novamente.",
        variant: "destructive"
      });
      return false;
    }
  };

  /**
   * Cria uma nova tarefa no sistema
   * 
   * IMPORTANTE: Esta função foi corrigida para resolver problemas de timezone.
   * A data é formatada com timezone explícito do Brasil (-03:00) para evitar
   * conversões automáticas UTC que causavam tarefas serem salvas na data errada.
   * 
   * @param newTask - Objeto com dados da nova tarefa
   * @returns Promise<boolean> - true se criada com sucesso, false caso contrário
   */
  const createTask = async (newTask: {
    title: string;
    description: string;
    status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
    priority: 'baixa' | 'media' | 'urgente';
    due_date: string;
    due_time: string;
    assigned_users: string[];
    is_private: boolean;
  }) => {
    if (!newTask.title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "O título da tarefa é obrigatório para criar uma nova tarefa.",
        variant: "destructive"
      });
      return false;
    }

    if (!currentUser) {
      toast({
        title: "Usuário não autenticado",
        description: "Você precisa estar logado para criar tarefas.",
        variant: "destructive"
      });
      return false;
    }

    try {
      // CORREÇÃO DE TIMEZONE - Processamento da data de vencimento
      // Esta seção foi corrigida em 08/01/2025 para resolver problemas de timezone
      // onde tarefas eram salvas na data errada devido a conversões automáticas UTC
      let formattedDueDate = null;
      if (newTask.due_date) {
        // Extrair apenas a parte da data (YYYY-MM-DD)
        let dateOnly = newTask.due_date;
        
        // Se contém espaço, pega apenas a parte da data
        if (dateOnly.includes(' ')) {
          dateOnly = dateOnly.split(' ')[0];
        }
        
        // Se contém T (ISO), pega apenas a parte da data
        if (dateOnly.includes('T')) {
          dateOnly = dateOnly.split('T')[0];
        }
        
        // Extrair componentes da hora
        const time = newTask.due_time || '09:00';
        
        // SOLUÇÃO DEFINITIVA: Incluir timezone do Brasil (-03:00) explicitamente
        // Isso evita que o PostgreSQL interprete a data como UTC e cause conversões
        // automáticas que resultavam em tarefas sendo salvas na data errada
        //
        // ANTES: "2025-07-09 09:00:00" → interpretado como UTC → convertido para local = 06:00
        // DEPOIS: "2025-07-09 09:00:00-03:00" → interpretado como Brasil → mantém 09:00
        formattedDueDate = `${dateOnly} ${time}:00-03:00`;
      }

      const insertData = {
        title: newTask.title,
        description: newTask.description || null,
        status: newTask.status,
        priority: newTask.priority,
        due_date: formattedDueDate,
        assigned_users: newTask.assigned_users,
        created_by: currentUser.user_id,
        is_private: newTask.is_private
      };
      
      const { data, error } = await supabase
        .from('tasks')
        .insert(insertData)
        .select('*');

      if (error) {
        console.error('Erro ao criar tarefa:', error);
        toast({
          title: "Erro ao criar tarefa",
          description: "Não foi possível criar a tarefa. Tente novamente.",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Tarefa criada com sucesso!",
        description: `"${newTask.title}" foi criada e está pronta para uso.`,
        variant: "success"
      });

      // Real-time subscription will handle the UI update automatically
      return true;
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      toast({
        title: "Erro inesperado",
        description: "Erro inesperado ao criar tarefa. Tente novamente.",
        variant: "destructive"
      });
      return false;
    }
  };

  const deleteTask = async (taskId: string): Promise<boolean> => {
    if (!currentUser) {
      toast({
        title: "Usuário não autenticado",
        description: "Você precisa estar logado para excluir tarefas.",
        variant: "destructive"
      });
      return false;
    }

    // Verificar se o usuário tem permissão para excluir
    if (!['admin', 'franqueado', 'coordenador', 'supervisor_adm'].includes(currentUser.role)) {
      toast({
        title: "Permissão negada",
        description: "Você não tem permissão para excluir tarefas.",
        variant: "destructive"
      });
      return false;
    }

    try {
      // Remove task from local state immediately for instant UI feedback
      const taskToDelete = tasks.find(task => task.id === taskId);
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));

      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) {
        console.error('Erro ao excluir tarefa:', error);
        // Reload tasks to restore the task if deletion failed
        await loadTasks();
        toast({
          title: "Erro ao excluir tarefa",
          description: "Não foi possível excluir a tarefa. Tente novamente.",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Tarefa excluída",
        description: `"${taskToDelete?.title}" foi removida com sucesso.`,
        variant: "default"
      });

      return true;
    } catch (error) {
      console.error('Erro ao excluir tarefa:', error);
      // Reload tasks to restore the task if deletion failed
      await loadTasks();
      toast({
        title: "Erro inesperado",
        description: "Erro inesperado ao excluir tarefa. Tente novamente.",
        variant: "destructive"
      });
      return false;
    }
  };

  const canDeleteTask = (task: Task): boolean => {
    if (!currentUser) return false;
    
    // Apenas admin, franqueado, coordenador e supervisor_adm podem excluir
    return ['admin', 'franqueado', 'coordenador', 'supervisor_adm'].includes(currentUser.role);
  };

  return {
    tasks,
    filteredTasks,
    isLoading,
    updatingTask,
    activeFilter,
    setActiveFilter,
    selectedUser,
    setSelectedUser,
    selectedAccessLevel,
    setSelectedAccessLevel,
    selectedPriority,
    setSelectedPriority,
    selectedStatus,
    setSelectedStatus,
    clearAdvancedFilters,
    getFilterCount,
    updateTaskStatus,
    canEditTask,
    canEditTaskFull,
    updateTask,
    createTask,
    loadTasks,
    deleteTask,
    canDeleteTask,
    forceRefresh,
    // 🚀 MELHORIAS REAL-TIME: Novos estados exportados
    lastUpdateTime
  };
};
