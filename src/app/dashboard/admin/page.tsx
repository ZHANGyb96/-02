'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from '@/store/useAuthStore';
import { API_URL } from '@/config/constants';
import { Loader2, Users, Key, Settings, Plus, RefreshCw, Trash2 } from 'lucide-react';

export default function DashboardAdminPage() {
  const token = useAuthStore(state => state.token);
  const { toast } = useToast();
  
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState({ public_key: '', private_key: '' });
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsProcessing] = useState(false);
  const [newLicense, setNewLicense] = useState('');

  // 发码表单
  const [genTier, setGenTier] = useState('PRO');
  const [genDays, setGenDays] = useState('365');

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, sRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/admin/settings`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      setUsers(await uRes.json());
      const sData = await sRes.json();
      setSettings({ public_key: sData.public_key || '', private_key: sData.private_key || '' });
    } catch (e) {
      toast({ variant: 'destructive', title: '数据拉取失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ publicKey: settings.public_key, privateKey: settings.private_key })
      });
      if (res.ok) toast({ title: '配置保存成功', description: '新密钥已立即生效。' });
    } catch (e) {
      toast({ variant: 'destructive', title: '保存失败' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/license/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tier: genTier, daysValid: parseInt(genDays) })
      });
      const data = await res.json();
      if (res.ok) {
        setNewLicense(data.license);
        toast({ title: '激活码签发成功' });
      } else {
        throw new Error(data.message);
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: '生成失败', description: e.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearUserLicense = async (userId: number) => {
    try {
      await fetch(`${API_URL}/api/v1/admin/users/license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, licenseKey: null })
      });
      toast({ title: '已取消授权' });
      fetchData();
    } catch (e) {
      toast({ variant: 'destructive', title: '操作失败' });
    }
  };

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex flex-1 flex-col gap-6 font-body">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">系统管理中心</h1>
          <p className="text-muted-foreground text-sm">管理用户授权、系统密钥及运行配置。</p>
        </div>
        <Button variant="outline" onClick={fetchData} className="gap-2"><RefreshCw className="h-4 w-4" /> 刷新</Button>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" />用户列表</TabsTrigger>
          <TabsTrigger value="keygen" className="gap-2"><Key className="h-4 w-4" />发码助手</TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" />系统配置</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader><CardTitle>注册用户概览</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>邮箱</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>授权状态</TableHead>
                    <TableHead>注册时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell><Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge></TableCell>
                      <TableCell>
                        {u.licenseKey ? <Badge variant="outline" className="text-green-500 border-green-500/20">已绑定 PRO/ELITE</Badge> : <Badge variant="ghost" className="text-muted-foreground">BASIC</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => clearUserLicense(u.id)} disabled={!u.licenseKey}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keygen">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>签发新授权</CardTitle><CardDescription>根据 RSA 私钥生成符合 RS256 标准的离线激活码。</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>授权等级</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={genTier} onChange={(e) => setGenTier(e.target.value)}>
                    <option value="PRO">PRO (专业版)</option>
                    <option value="ELITE">ELITE (旗舰版)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>有效时长 (天，0为永久)</Label>
                  <Input type="number" value={genDays} onChange={(e) => setGenDays(e.target.value)} />
                </div>
                <Button className="w-full gap-2" onClick={handleGenerate} disabled={isGenerating}><Plus className="h-4 w-4" /> 立即生成激活码</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>生成结果</CardTitle><CardDescription>请复制下方代码发给用户。</CardDescription></CardHeader>
              <CardContent>
                {newLicense ? (
                  <div className="space-y-2">
                    <Textarea readOnly className="h-32 font-mono text-xs bg-muted" value={newLicense} />
                    <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard.writeText(newLicense); toast({ title: '已复制到剪贴板' }); }}>复制</Button>
                  </div>
                ) : (
                  <div className="flex h-32 items-center justify-center border-2 border-dashed rounded-md text-muted-foreground text-sm">等待签发...</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader><CardTitle>动态密钥配置</CardTitle><CardDescription>在此更新系统的 RSA 2048 密钥对。一旦更新，旧公钥签发的激活码将全部失效。</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>RSA 公钥 (Public Key)</Label>
                <Textarea placeholder="-----BEGIN PUBLIC KEY-----" className="h-24 font-mono text-xs" value={settings.public_key} onChange={(e) => setSettings({...settings, public_key: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>RSA 私钥 (Private Key) - 仅限发码使用</Label>
                <Textarea placeholder="-----BEGIN PRIVATE KEY-----" className="h-48 font-mono text-xs" value={settings.private_key} onChange={(e) => setSettings({...settings, private_key: e.target.value})} />
              </div>
              <div className="bg-destructive/10 p-4 rounded-md border border-destructive/20 text-destructive text-sm flex gap-2">
                <Settings className="h-5 w-5 shrink-0" />
                <p><b>警告：</b> 修改密钥属于极其敏感的操作。请确保公私钥完全配对，否则将无法验证新码且导致现有用户无法访问 PRO 功能。</p>
              </div>
              <Button className="w-full" onClick={handleUpdateSettings} disabled={isGenerating}>保存并应用系统设置</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
