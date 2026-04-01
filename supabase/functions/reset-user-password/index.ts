
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

    const { email, newPassword } = await req.json()

    if (!email || !newPassword) {
      return new Response(JSON.stringify({ error: 'Email e nova senha são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'Senha deve ter pelo menos 8 caracteres' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Buscar usuário pelo email no user_profiles
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id, name, email, is_active')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (profileError || !userProfile) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!userProfile.is_active) {
      return new Response(JSON.stringify({ error: 'Conta desativada. Entre em contato com o administrador.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Atualizar senha via Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userProfile.user_id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('Erro ao atualizar senha:', updateError)
      return new Response(JSON.stringify({ error: 'Falha ao redefinir senha' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Marcar usuário para trocar senha no próximo login
    await supabase
      .from('user_profiles')
      .update({ first_login_completed: false })
      .eq('user_id', userProfile.user_id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Erro na função reset-user-password:', error)
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
