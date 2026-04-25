'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/logo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, Key, AlertCircle, ExternalLink, LogOut } from 'lucide-react';
import { useLicenseStore } from '@/store/useLicenseStore';
import { useAuthStore } from '@/store/useAuthStore';

export default function ActivationPage() {
  const router = useRouter();
  const { activate, isValid, isInitialized } = useLicenseStore();
  const { logout, user } = useAuthStore();
  const { toast } = useToast();
  const [licenseKey, setLicenseKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. 身份拦截：如果没有登录，必须先登录
  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  // 2. 授权拦截：如果已经是有效授权，直接进入仪表盘
  useEffect(() => {
    if (isInitialized && isValid) {
      router.push('/dashboard');
    }
  }, [isInitialized, isValid, router]);

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;
    setIsLoading(true);
    setError(null);

    const result = await activate(licenseKey.trim());
    
    if (result.success) {
      toast({ title: '软件激活成功', description: '正在进入量化工作台...' });
      router.push('/dashboard');
    } else {
      setError(result.message);
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#17191C] p-4 font-body">
      <div className="mb-10 text-center">
        <Logo />
        <p className="text-muted-foreground mt-2">AlphaScan AI 离线授权版</p>
      </div>
      
      <Card className="w-full max-w-lg border-primary/20 bg-card/50 backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Key className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-headline">软件激活</CardTitle>
          <CardDescription>
            当前登录: <span className="text-primary font-bold">{user.email}</span><br />
            请输入您的 License Key 以解锁专业量化功能。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive" className="bg-destructive/10">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>授权验证失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Textarea 
              placeholder="请粘贴您的 2048位 加密激活码..." 
              className="min-h-[120px] font-mono text-xs leading-relaxed bg-background/50 border-primary/10"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
            />
          </div>
          
          <Button 
            className="w-full h-12 text-lg font-bold" 
            size="lg"
            onClick={handleActivate}
            disabled={isLoading || !licenseKey}
          >
            {isLoading ? '正在校验 RSA 证书...' : '立即激活软件'}
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col border-t pt-6 text-center gap-4">
          <p className="text-xs text-muted-foreground">
            没有激活码？请联系管理员或访问官方发行渠道。
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="link" size="sm" className="gap-1 text-primary">
                <span>获取帮助</span>
                <ExternalLink className="h-3 w-3" />
            </Button>
            <div className="w-px h-4 bg-border" />
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={handleLogout}>
                <LogOut className="h-3 w-3" />
                <span>更换账号</span>
            </Button>
          </div>
        </CardFooter>
      </Card>
      
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-green-500" />
        RSA-2048 工业级安全保护 | 本地离线验签
      </div>
    </div>
  );
}
