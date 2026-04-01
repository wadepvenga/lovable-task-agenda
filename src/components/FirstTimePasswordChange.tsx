import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Eye, EyeOff, LogOut } from 'lucide-react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { sanitizeInput } from '@/utils/inputValidation';
import { APP_NAME } from '@/constants/app';
import Logo from '@/components/ui/Logo';

const FirstTimePasswordChange: React.FC = () => {
  const [passwordData, setPasswordData] = useState({ 
    newPassword: '', 
    confirmPassword: '' 
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    new: false,
    confirm: false
  });
  const { firstTimePasswordChange, logout } = useSupabaseAuth();

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      console.log('As senhas não coincidem!');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      console.log('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const success = await firstTimePasswordChange(passwordData.newPassword);
      if (!success) {
        console.error('Erro ao alterar senha');
      }
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleShowPassword = (field: 'new' | 'confirm') => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleBackToLogin = async () => {
    try {
      await logout();
      // O logout automaticamente redireciona para a tela de login
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-slate-800/50 backdrop-blur-sm border-slate-700">
        <CardHeader className="text-center py-3">
          {/* LOGO DA ROCKFELLER - Tamanho XL (300% maior) */}
          <Logo size="xl" variant="icon" className="mx-auto mb-2" />
          <CardTitle className="text-white text-base mb-1">{APP_NAME}</CardTitle>
          <p className="text-slate-400 text-sm">Primeira alteração de senha</p>
        </CardHeader>
        
        <CardContent className="py-3">
          <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded-lg">
            <p className="text-slate-300 text-sm">
              <strong>Primeiro acesso:</strong> Crie sua nova senha pessoal para substituir a senha temporária.
            </p>
          </div>
          
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <Label htmlFor="new-password" className="text-slate-300 text-sm">Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="new-password"
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="bg-slate-700/50 border-slate-600 text-white pl-10 pr-10 h-9"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('new')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-300"
                >
                  {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            
            <div>
              <Label htmlFor="confirm-password" className="text-slate-300 text-sm">Confirmar Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="confirm-password"
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="bg-slate-700/50 border-slate-600 text-white pl-10 pr-10 h-9"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('confirm')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-300"
                >
                  {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 h-9 mt-3"
            >
              {isLoading ? 'Alterando...' : 'Alterar Senha'}
            </Button>
          </form>
          
          <div className="mt-4 pt-4 border-t border-slate-700">
            <Button
              type="button"
              onClick={handleBackToLogin}
              variant="outline"
              className="w-full bg-red-900/20 border-red-500 text-red-400 hover:text-red-300 hover:border-red-400 h-10 font-semibold"
            >
              <LogOut className="h-4 w-4 mr-2" />
              🔙 VOLTAR AO LOGIN
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FirstTimePasswordChange; 