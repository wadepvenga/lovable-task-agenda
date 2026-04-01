import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Eye, EyeOff, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Senhas não coincidem",
        description: "Por favor, certifique-se de que a nova senha e a confirmação são iguais.",
        variant: "destructive"
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A nova senha deve ter pelo menos 6 caracteres.",
        variant: "destructive"
      });
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
    <div className="h-screen w-full bg-background text-foreground flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-card backdrop-blur-sm border border-border">
        <CardHeader className="text-center py-3">
          {/* LOGO DA ROCKFELLER - Tamanho XL (300% maior) */}
          <Logo size="xl" variant="icon" className="mx-auto mb-2" />
          <CardTitle className="text-foreground text-base mb-1">{APP_NAME}</CardTitle>
          <p className="text-muted-foreground text-sm">Primeira alteração de senha</p>
        </CardHeader>
        
        <CardContent className="py-3">
          <div className="mb-4 p-3 bg-muted border border-border rounded-lg">
            <p className="text-muted-foreground text-sm">
              <strong>Primeiro acesso:</strong> Crie sua nova senha pessoal para substituir a senha temporária.
            </p>
          </div>
          
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <Label htmlFor="new-password" className="text-muted-foreground text-sm">Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="new-password"
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="bg-muted border-border text-foreground pl-10 pr-10 h-9"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('new')}
                  className="absolute right-3 top-3 text-muted-foreground hover:opacity-80"
                >
                  {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            
            <div>
              <Label htmlFor="confirm-password" className="text-muted-foreground text-sm">Confirmar Nova Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="bg-muted border-border text-foreground pl-10 pr-10 h-9"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('confirm')}
                  className="absolute right-3 top-3 text-muted-foreground hover:opacity-80"
                >
                  {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground hover:opacity-90 h-9 mt-3"
            >
              {isLoading ? 'Alterando...' : 'Alterar Senha'}
            </Button>
          </form>
          
          <div className="mt-4 pt-4 border-t border-border">
            <Button
              type="button"
              onClick={handleBackToLogin}
              variant="outline"
              className="w-full bg-destructive/10 border-destructive text-destructive hover:opacity-90 h-10 font-semibold"
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