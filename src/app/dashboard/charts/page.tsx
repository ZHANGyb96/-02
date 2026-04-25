import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ChartView from "./chart-view";

export default function ChartsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          图表分析
        </h1>
        <p className="text-muted-foreground">
          交互式 K 线图与技术指标分析。
        </p>
      </div>
      <Card>
        <CardHeader>
            <CardTitle>市场数据</CardTitle>
            <CardDescription>选择一个标的以查看其详细的K线和指标数据。</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartView />
        </CardContent>
      </Card>
    </div>
  );
}
