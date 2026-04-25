'use client';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { LoaderCircle, Settings, ShieldCheck } from 'lucide-react';
import { SidebarNav } from '@/components/sidebar-nav';
import { DashboardHeader } from '@/components/dashboard-header';
import { Logo } from '@/components/logo';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useLicenseStore } from '@/store/useLicenseStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Badge } from '@/components/ui/badge';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isValid, tier, isInitialized: licenseInit, checkStatus } = useLicenseStore();
  const { user, isInitialized: authInit } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    // 1. 如果身份验证已初始化但用户未登录，去登录页
    if (authInit && !user) {
      router.push('/login');
      return;
    }

    // 2. 如果已登录但 License 无效（且 License 已初始化），去激活页
    if (authInit && user && licenseInit && !isValid) {
      router.push('/activate');
      return;
    }
  }, [authInit, user, licenseInit, isValid, router]);

  // 渲染加载态
  if (!authInit || !licenseInit || !user || !isValid) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#17191C]">
        <div className="text-center">
            <LoaderCircle className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="mt-4 text-sm text-muted-foreground font-body">正在初始化量化分析环境...</p>
        </div>
      </div>
    );
  }
  
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo />
          <div className="px-2 mt-2">
            <Badge variant="secondary" className="w-full justify-center py-1 gap-1 border-primary/20 font-headline">
                <ShieldCheck className="h-3 w-3 text-primary" />
                {tier} EDITION
            </Badge>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
        <SidebarFooter>
          <Button variant="ghost" className="justify-start gap-2">
            <Settings className="h-4 w-4" />
            <span>系统设置</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex min-h-screen w-full flex-col">
          <DashboardHeader />
          <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
