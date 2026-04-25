'use client';

import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, PlusCircle, Send, Trash2, Zap, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBacktestTaskStore } from "@/store/useBacktestTaskStore";
import { TIME_PERIODS } from "@/config/constants";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect } from "react";
import { useMarketDataStore } from "@/store/useMarketDataStore";

// 【保留绝对基准】完整的指标配置表
const INDICATOR_CONFIG = {
  MA: {
    label: 'MA',
    lines:[
      { value: 'ma5', label: 'MA5' }, { value: 'ma10', label: 'MA10' }, 
      { value: 'ma20', label: 'MA20' }, { value: 'ma60', label: 'MA60' },
      { value: 'close', label: '收盘价' }, { value: 'open', label: '开盘价' },
    ]
  },
  MACD: {
    label: 'MACD',
    lines:[
      { value: 'macd', label: 'DIF' },
      { value: 'macd_signal', label: 'DEA' },
      { value: 'macd_hist', label: 'MACD' }
    ]
  },
  KDJ: {
    label: 'KDJ',
    lines:[
      { value: 'kdj_k', label: 'K' },
      { value: 'kdj_d', label: 'D' },
      { value: 'kdj_j', label: 'J' }
    ]
  },
  TRIX: {
    label: 'TRIX',
    lines:[
      { value: 'trix', label: 'TRIX' },
      { value: 'trma', label: 'TRMA1' },
    ]
  },
  BOLL: {
    label: 'BOLL',
    lines:[
      { value: 'boll_upper', label: '上轨' },
      { value: 'boll_middle', label: '中轨' },
      { value: 'boll_lower', label: '下轨' },
      { value: 'close', label: '收盘价' },
    ],
  },
  DMI: {
    label: 'DMI',
    lines:[
      { value: 'pdi', label: 'DI1 (+DI)' },
      { value: 'mdi', label: 'DI2 (-DI)' },
      { value: 'adx', label: 'ADX' },
      { value: 'adxr', label: 'ADXR' },
    ],
  },
  BIAS: {
    label: 'BIAS',
    lines:[
      { value: 'bias_6', label: 'BIAS1' },
      { value: 'bias_12', label: 'BIAS2' },
      { value: 'bias_24', label: 'BIAS3' },
      { value: 'close', label: '收盘价' },
    ],
  },
  BBI: {
    label: 'BBI (多空线)',
    lines:[
      { value: 'bbi', label: 'BBI' },
      { value: 'close', label: '收盘价' },
    ],
  },
  CCI: {
    label: 'CCI',
    lines: [{ value: 'cci', label: 'CCI' }],
  },
  DPO: {
    label: 'DPO',
    lines:[
      { value: 'dpo', label: 'DPO' },
      { value: 'madpo', label: 'MADPO' },
    ],
  },
  RSI: {
    label: 'RSI',
    lines:[
      { value: 'rsi_6', label: 'RSI1' },
      { value: 'rsi_12', label: 'RSI2' },
      { value: 'rsi_24', label: 'RSI3' },
    ]
  },
  LON: {
    label: 'LON (钱龙长线)',
    lines:[
      { value: 'lon', label: 'LONG' },
      { value: 'lonma', label: 'MA1' },
    ]
  }
};

// 【保留绝对基准】完整的预设战法表
const PRESETS =[
  { value: 'custom', label: '🛠️ 自定义组合 (高级)' },
  { value: 'bull_trend', label: '🔥 极度多头 (MA5>10>20 趋势追踪)' },
  { value: 'ma_golden_cross', label: '⚔️ 均线金叉 (带量能过滤+底乖离)' },
  { value: 'volume_breakout', label: '🚀 放量突破 (创20日新高动量买入)' },
  { value: 'shrink_pullback', label: '📉 缩量回踩 (主升浪回调低吸)' },
  { value: 'bottom_volume', label: '🌋 底部放量 (60日均线下方试盘)' },
  { value: 'one_yang_three_yin', label: '🐉 一阳吞三阴 (极致K线反转)' },
];

const conditionSchema = z.object({
  period: z.string().min(1, "必须选择周期"),
  indicator: z.string().min(1, "必须选择指标"),
  left: z.string().min(1, "必须选择左值"),
  operator: z.enum(['>', '<']),
  rightType: z.enum(['line', 'value']),
  rightValue: z.string().min(1, "必须提供右值"),
});

export const strategyFormSchema = z.object({
  strategyName: z.string().min(1, "策略名称不能为空"),
  stockCode: z.string().min(1, "必须选择一个标的"),
  preset: z.string().optional().default('custom'),
  period: z.string().optional().default('1d'),
  // 【植入】引入时间范围验证
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  conditions: z.array(conditionSchema).optional(),
  logic: z.enum(["AND", "OR"]).optional(),
});

export type StrategyFormValues = z.infer<typeof strategyFormSchema>;

export default function StrategyBuilder() {
  const { toast } = useToast();
  const { isSubmitting, submitTask } = useBacktestTaskStore();
  const token = useAuthStore(state => state.token);
  const { availableSymbols, fetchSymbols } = useMarketDataStore();

  useEffect(() => {
    if (token) {
        fetchSymbols();
    }
  }, [token, fetchSymbols]);

  const form = useForm<StrategyFormValues>({
    resolver: zodResolver(strategyFormSchema),
    // 【植入】更新默认值以适配全市场和时间选项
    defaultValues: {
      strategyName: `全市场极速截面扫描 ${new Date().toLocaleDateString()}`,
      stockCode: 'ALL', 
      preset: 'ma_golden_cross',
      period: '1d',
      startTime: '2023-01-01',
      endTime: '',
      conditions:[{
        period: '1d',
        indicator: 'MACD',
        left: 'macd',
        operator: '>',
        rightType: 'line',
        rightValue: 'macd_signal'
      }],
      logic: "AND",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "conditions",
  });
  
  const conditions = useWatch({ control: form.control, name: 'conditions' });
  const currentPreset = useWatch({ control: form.control, name: 'preset' });

  const onSubmit = async (data: StrategyFormValues) => {
    await submitTask(data);
    const { taskId, error } = useBacktestTaskStore.getState();

    // 【保留绝对基准】恢复完整的提交后错误处理与提示
    if (taskId && !error) {
       toast({
            title: "任务已提交",
            description: `回测任务 #${taskId} 已成功创建并开始执行。`,
        });
    } else if (error) {
         toast({
            variant: "destructive",
            title: "提交失败",
            description: error || "与服务器通信时发生错误。",
        });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="strategyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>任务名称</FormLabel>
                <FormControl><Input placeholder="例如：全市场MACD共振扫描" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
              control={form.control}
              name="stockCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-primary font-bold">扫描范围 (标的池)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="选择品种..." /></SelectTrigger></FormControl>
                    <SelectContent>
                        {/* 【植入】引入 ALL 选项 */}
                        <SelectItem value="ALL" className="font-bold text-primary">🌐 全市场暴力扫描 (ALL)</SelectItem>
                        {availableSymbols.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
          />
        </div>

        {/* 【植入】新增时间范围控制面板 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/30 p-4 rounded-lg border">
            <FormField control={form.control} name="startTime" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1"><CalendarDays className="w-4 h-4"/>起始日期</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="endTime" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1"><CalendarDays className="w-4 h-4"/>结束日期 (留空为至今)</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
              </FormItem>
            )} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-amber-500/10 p-4 rounded-lg border border-amber-500/20">
          <FormField
            control={form.control}
            name="preset"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center text-amber-600 dark:text-amber-500 font-bold">
                  <Zap className="h-4 w-4 mr-1" /> 量化战法库 (高速预设通道)
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger className="border-amber-500/50"><SelectValue placeholder="选择预设战法..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    {PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 【保留绝对基准】未阉割周期选择逻辑 */}
          {currentPreset !== 'custom' && (
             <FormField
               control={form.control}
               name="period"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel>执行周期</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value}>
                     <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                     <SelectContent>{TIME_PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                   </Select>
                 </FormItem>
               )}
             />
          )}
        </div>
        
        {/* 【保留绝对基准】庞大且关键的自定义条件构建器，全量保留！ */}
        {currentPreset === 'custom' && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
          <h3 className="text-base font-semibold mb-3">自定义指标条件</h3>
          <div className="space-y-4">
              {fields.map((field, index) => {
                const selectedIndicatorKey = conditions?.[index]?.indicator as keyof typeof INDICATOR_CONFIG | undefined;
                const availableLines = selectedIndicatorKey ? INDICATOR_CONFIG[selectedIndicatorKey].lines : [];
                const rightType = conditions?.[index]?.rightType;

                return (
                <div key={field.id} className="p-4 border rounded-lg bg-background/50 space-y-4">
                  {/* Row 1: Period, Indicator, Remove */}
                  <div className="flex items-start gap-4">
                    <FormField control={form.control} name={`conditions.${index}.period`} render={({ field: f }) => (
                      <FormItem className="flex-1">
                        <FormLabel>时间周期</FormLabel>
                        <Select onValueChange={f.onChange} defaultValue={f.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{TIME_PERIODS.map(p=><SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`conditions.${index}.indicator`} render={({ field: f }) => (
                      <FormItem className="flex-1">
                        <FormLabel>指标</FormLabel>
                        <Select onValueChange={f.onChange} defaultValue={f.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{Object.entries(INDICATOR_CONFIG).map(([key, config])=> <SelectItem key={key} value={key}>{config.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <div className="pt-8">
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="shrink-0 text-muted-foreground hover:text-destructive h-9 w-9">
                          <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Row 2: Left Value, Operator, Right Type, Right Value */}
                  <div className="flex flex-wrap items-end gap-2">
                    <FormField control={form.control} name={`conditions.${index}.left`} render={({ field: f }) => (
                      <FormItem className="flex-grow min-w-[100px]">
                        <FormLabel>左值</FormLabel>
                        <Select onValueChange={f.onChange} defaultValue={f.value} disabled={!selectedIndicatorKey}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{availableLines.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`conditions.${index}.operator`} render={({ field: f }) => (
                      <FormItem className="w-16">
                         <FormLabel className="invisible">比较</FormLabel>
                        <Select onValueChange={f.onChange} defaultValue={f.value}>
                          <FormControl><SelectTrigger className="justify-center"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value=">">&gt;</SelectItem>
                            <SelectItem value="<">&lt;</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                     <FormField control={form.control} name={`conditions.${index}.rightType`} render={({ field: f }) => (
                        <FormItem className="flex-grow min-w-[100px]">
                            <FormLabel>右值类型</FormLabel>
                            <Select onValueChange={f.onChange} defaultValue={f.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="line">指标线</SelectItem>
                                    <SelectItem value="value">数值</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )} />
                    <FormItem className="flex-grow min-w-[100px]">
                        <FormLabel className="invisible">右值</FormLabel>
                        {rightType === 'line' ? (
                            <FormField control={form.control} name={`conditions.${index}.rightValue`} render={({ field: f }) => (
                                <Select onValueChange={f.onChange} defaultValue={f.value} disabled={!selectedIndicatorKey}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>{availableLines.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                                </Select>
                            )} />
                        ) : (
                            <FormField control={form.control} name={`conditions.${index}.rightValue`} render={({ field: f }) => (
                                <FormControl><Input type="number" step="any" {...f} /></FormControl>
                            )} />
                        )}
                    </FormItem>
                  </div>
                   <FormMessage className="pt-1">{form.formState.errors.conditions?.[index]?.left?.message || form.formState.errors.conditions?.[index]?.rightValue?.message}</FormMessage>
                </div>
              )})}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4">
             <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => append({ period: '1d', indicator: 'MACD', left: 'macd', operator: '>', rightType: 'line', rightValue: 'macd_signal' })} 
            >
              <PlusCircle className="mr-2 h-4 w-4" /> 添加条件
            </Button>
            {fields.length > 1 && (
            <FormField
              control={form.control}
              name="logic"
              render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                        <SelectTrigger className="w-[250px]">
                            <SelectValue />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="AND">所有条件必须同时满足 (AND)</SelectItem>
                      <SelectItem value="OR">满足任意一个条件即可 (OR)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            )}
          </div>
        </div>
        )}

        <Alert className="mt-6 bg-green-500/5 border-green-500/30">
            <Info className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-600">多周期混合回测已支持！</AlertTitle>
            <AlertDescription className="text-green-900/80 dark:text-green-300/80">
                <p className="text-xs mt-2">
                    系统现已完美支持高级**多周期混合策略**。回测引擎的主时间流将由**第一个添加的条件**设定的时间周期（主周期）决定。对于其他设置为不同周期的条件（副周期），系统会自动将其进行时间轴向下对齐（防止前视偏差），并与主周期的信号同时进行共振计算。最终**展示的回测结果和胜率统计仅以主周期为准**。
                </p>
            </AlertDescription>
        </Alert>

        <Button type="submit" size="lg" className="w-full bg-green-600 hover:bg-green-700 text-lg text-white font-bold" disabled={isSubmitting}>
          {/* 【植入】文案更新，更具动感 */}
          <Send className="mr-2 h-5 w-5" /> {isSubmitting ? "引擎轰鸣中...请耐心等待" : "发射！开始暴力扫参"}
        </Button>
      </form>
    </Form>
  );
}