
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verificar se o chamador está autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verificar se o chamador tem role admin ou franqueado
    const { data: callerProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profileError || !callerProfile || !['admin', 'franqueado'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { name, email, role, password } = await req.json()

    if (!name || !email || !role || !password) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios: name, email, role, password' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Senha deve ter pelo menos 8 caracteres' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Criar usuário via Admin API com email já confirmado (sem exigir confirmação por email)
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirma email automaticamente, sem enviar email de confirmação do Supabase
      user_metadata: { full_name: name }
    })

    if (createError) {
      console.error('Erro ao criar usuário auth:', createError)
      return new Response(JSON.stringify({ error: createError.message || 'Falha ao criar usuário' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!newUser.user) {
      return new Response(JSON.stringify({ error: 'Usuário não foi criado' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Criar ou atualizar perfil no user_profiles
    // Upsert para lidar com trigger automático que pode ter criado um perfil padrão
    const { error: upsertError } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: newUser.user.id,
        name,
        email,
        role,
        is_active: true,
        first_login_completed: false // Usuário deve trocar senha no primeiro acesso
      }, { onConflict: 'user_id' })

    if (upsertError) {
      console.error('Erro ao criar perfil:', upsertError)
      // Remover o usuário auth se falhou a criação do perfil
      await supabase.auth.admin.deleteUser(newUser.user.id)
      return new Response(JSON.stringify({ error: 'Falha ao criar perfil do usuário' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Erro na função create-user:', error)
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
