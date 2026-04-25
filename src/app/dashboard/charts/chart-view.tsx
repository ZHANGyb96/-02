'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIME_PERIODS } from '@/config/constants';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Settings, Trash2, Plus, Loader2, AlertCircle, ServerCrash } from 'lucide-react';
import { IndicatorType, indicatorList } from '@/components/kline-chart';
import { useAuthStore } from '@/store/useAuthStore';
import { useMarketDataStore } from '@/store/useMarketDataStore';
import { maConfig } from '@/components/kline-chart';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


const KlineChart = dynamic(() => import('@/components/kline-chart').then(mod => mod.KlineChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[700px] w-full bg-transparent" />,
});

export default function ChartView() {
  const [isClient, setIsClient] = useState(false);
  const [selectedStock, setSelectedStock] = useState('sh510300');
  const [selectedPeriod, setSelectedPeriod] = useState('1d');
  const token = useAuthStore(state => state.token);
  const { availableSymbols, fetchSymbols, error: symbolsError, isLoading: symbolsLoading } = useMarketDataStore();

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Effect to fetch symbols list on mount or when token changes
  useEffect(() => {
    if (isClient && token) {
      fetchSymbols();
    }
  }, [isClient, token, fetchSymbols]);


  // This effect ensures that if the available symbols change (e.g., after deletion)
  // and the currently selected stock is no longer valid, we select a new valid one.
  useEffect(() => {
    if (availableSymbols.length > 0 && !availableSymbols.some(s => s.value === selectedStock)) {
      setSelectedStock(availableSymbols[0].value);
    } else if (availableSymbols.length === 0 && selectedStock !== '') {
      // If the list becomes empty, clear the selection.
      setSelectedStock('');
    }
  }, [availableSymbols, selectedStock]);

  const [visibleMAs, setVisibleMAs] = useState<Record<string, boolean>>({
    ma5: true, ma10: true, ma20: true, ma60: true, ma120: false, ma250: false,
  });
  const [showDivergence, setShowDivergence] = useState<boolean>(true);
  const [showTrixSignal, setShowTrixSignal] = useState<boolean>(true);
  const [showDpoSignal, setShowDpoSignal] = useState<boolean>(true);
  const [showBbiSignal, setShowBbiSignal] = useState<boolean>(true);
  const [indicatorPanes, setIndicatorPanes] = useState<IndicatorType[]>(['Volume', 'MACD']);

  const handleMAChange = (maKey: string, checked: boolean) => {
    setVisibleMAs(prev => ({ ...prev, [maKey]: checked }));
  };

  const handleIndicatorChange = (index: number, newIndicator: IndicatorType) => {
    const newPanes = [...indicatorPanes];
    newPanes[index] = newIndicator;
    setIndicatorPanes(newPanes);
  };

  const addIndicatorPane = () => {
    if (indicatorPanes.length < 3) {
      const currentIndicators = new Set(indicatorPanes);
      const indicatorToAdd = indicatorList.find(ind => !currentIndicators.has(ind.value))?.value || 'RSI';
      setIndicatorPanes([...indicatorPanes, indicatorToAdd]);
    }
  };

  const removeIndicatorPane = (index: number) => {
    setIndicatorPanes(indicatorPanes.filter((_, i) => i !== index));
  };


  const renderChartContent = () => {
    if (!isClient) {
        return (
             <div className="flex h-full w-full flex-col items-center justify-center p-4 text-muted-foreground">
              <Loader2 className="h-12 w-12 animate-spin" />
              <h3 className="mt-4 text-lg font-semibold">正在加载图表...</h3>
            </div>
        );
    }

    if (symbolsLoading) {
        return (
             <div className="flex h-full w-full flex-col items-center justify-center p-4 text-muted-foreground">
              <Loader2 className="h-12 w-12 animate-spin" />
              <h3 className="mt-4 text-lg font-semibold">正在加载品种列表...</h3>
            </div>
        );
    }

    if (symbolsError) {
        return (
            <Alert variant="destructive" className="h-full m-4 lg:m-0">
                <ServerCrash className="h-4 w-4" />
                <AlertTitle>数据加载失败</AlertTitle>
                <AlertDescription>
                    {symbolsError}
                </AlertDescription>
            </Alert>
        );
    }
    
    return (
        <KlineChart 
            stockCode={selectedStock} 
            period={selectedPeriod} 
            visibleMAs={visibleMAs}
            indicatorPanes={indicatorPanes}
            showDivergence={showDivergence}
            showTrixSignal={showTrixSignal}
            showDpoSignal={showDpoSignal}
            showBbiSignal={showBbiSignal}
        />
    );
  };


  return (
    <div className="space-y-4">
       <div className="flex flex-wrap items-center gap-4">
         <div className="w-full sm:w-auto sm:max-w-xs">
            <Select value={selectedStock} onValueChange={setSelectedStock} disabled={!isClient || symbolsLoading || availableSymbols.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="选择一个品种..." />
              </SelectTrigger>
              <SelectContent>
                {availableSymbols.map((stock) => (
                  <SelectItem key={stock.value} value={stock.value}>
                    {stock.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-muted p-1 flex-wrap">
          {TIME_PERIODS.map((p) => (
            <Button
              key={p.value}
              variant={selectedPeriod === p.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedPeriod(p.value)}
              className="h-8 px-3"
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
            <Popover>
             <PopoverTrigger asChild>
               <Button variant="outline" size="icon"><Settings className="h-4 w-4" /></Button>
             </PopoverTrigger>
             <PopoverContent className="w-80">
               <div className="grid gap-4">
                 <div className="space-y-2">
                   <h4 className="font-medium leading-none">图表设置</h4>
                   <p className="text-sm text-muted-foreground">自定义您的图表展示。</p>
                 </div>
                 <div className="grid gap-2">
                   <h5 className="text-sm font-medium">主图指标</h5>
                   <div className="grid grid-cols-3 gap-2">
                     {Object.entries(maConfig).map(([key, config]) => (
                       <div key={key} className="flex items-center space-x-2">
                         <Checkbox id={key} checked={!!visibleMAs[key]} onCheckedChange={(checked) => handleMAChange(key, !!checked)} />
                         <Label htmlFor={key} className="text-xs">{config.label}</Label>
                       </div>
                     ))}
                   </div>
                   <div className="flex items-center space-x-2 pt-2 border-t mt-2">
                     <Checkbox id="divergence" checked={showDivergence} onCheckedChange={(checked) => setShowDivergence(!!checked)} />
                     <Label htmlFor="divergence" className="text-xs font-medium">MACD背离信号</Label>
                   </div>
                    <div className="flex items-center space-x-2">
                     <Checkbox id="trix" checked={showTrixSignal} onCheckedChange={(checked) => setShowTrixSignal(!!checked)} />
                     <Label htmlFor="trix" className="text-xs font-medium">TRIX买卖信号</Label>
                   </div>
                    <div className="flex items-center space-x-2">
                     <Checkbox id="dpo" checked={showDpoSignal} onCheckedChange={(checked) => setShowDpoSignal(!!checked)} />
                     <Label htmlFor="dpo" className="text-xs font-medium">DPO买卖信号</Label>
                   </div>
                    <div className="flex items-center space-x-2">
                     <Checkbox id="bbi" checked={showBbiSignal} onCheckedChange={(checked) => setShowBbiSignal(!!checked)} />
                     <Label htmlFor="bbi" className="text-xs font-medium">BBI买卖信号</Label>
                   </div>
                 </div>
                 <div className="grid gap-2">
                    <h5 className="text-sm font-medium">副图指标 (最多3个)</h5>
                    <div className="space-y-2">
                      {indicatorPanes.map((indicator, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Select value={indicator} onValueChange={(val) => handleIndicatorChange(index, val as IndicatorType)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{indicatorList.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeIndicatorPane(index)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={addIndicatorPane} disabled={indicatorPanes.length >= 3} className="mt-2">
                      <Plus className="mr-2 h-4 w-4" /> 添加副图
                    </Button>
                 </div>
               </div>
             </PopoverContent>
           </Popover>
         </div>
      </div>
      
      <div className="h-[700px] w-full">
        {renderChartContent()}
      </div>
    </div>
  );
}
