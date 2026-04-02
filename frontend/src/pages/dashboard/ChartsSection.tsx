import { Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import PieChartIcon from "@mui/icons-material/PieChart";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardCharts } from "./types";
import { chartLabelToDayRange, PIE_COLORS } from "./chartUtils";

type Props = {
  charts: DashboardCharts | undefined;
  loading: boolean;
};

function useObservedWidth(deps: readonly unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      setWidth(0);
      return;
    }
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- переподключение при появлении графика после loading
  }, deps);
  return { ref, width };
}

export const ChartsSection = memo(function ChartsSection({ charts, loading }: Props) {
  const navigate = useNavigate();

  const lineData = useMemo(() => {
    if (!charts?.orders_line) return [];
    const { labels, values } = charts.orders_line;
    return labels.map((label, i) => ({ label, orders: values[i] ?? 0 }));
  }, [charts?.orders_line]);

  const { ref: lineWrapRef, width: lineChartWidth } = useObservedWidth([loading, lineData.length]);

  const pieData = useMemo(() => {
    if (!charts?.status_distribution?.length) return [];
    return charts.status_distribution.map((s) => ({
      name: s.name,
      value: s.count,
      code: s.code,
    }));
  }, [charts?.status_distribution]);

  const onLinePointClick = (label: unknown) => {
    if (typeof label !== "string") return;
    const r = chartLabelToDayRange(label);
    if (!r) return;
    navigate(`/orders?received_date_from=${r.from}&received_date_to=${r.to}`);
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 2,
          mb: 3,
        }}
      >
        {[1, 2].map((k) => (
          <Card key={k} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Skeleton height={32} sx={{ mb: 2 }} />
              <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 1 }} />
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
        gap: 2,
        mb: 3,
      }}
    >
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <ShowChartIcon color="primary" fontSize="small" />
            Динамика заказов (14 дней)
          </Typography>
          {lineData.length === 0 ? (
            <Typography color="text.secondary">Нет данных для графика</Typography>
          ) : (
            <Box
              ref={lineWrapRef}
              sx={{
                width: "100%",
                minWidth: 0,
                height: 280,
                minHeight: 280,
                position: "relative",
              }}
            >
              {lineChartWidth > 0 ? (
                <LineChart width={lineChartWidth} height={280} data={lineData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
                  {/* cursor={false}: иначе слой курсора Tooltip перехватывает клики по точкам */}
                  <Tooltip cursor={false} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    name="Заказы"
                    stroke="#2563eb"
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={(dotProps) => {
                      const { cx, cy, index } = dotProps as {
                        cx?: number;
                        cy?: number;
                        index?: number;
                      };
                      const label = typeof index === "number" ? lineData[index]?.label : undefined;
                      if (cx == null || cy == null || label == null) return null;
                      return (
                        <g style={{ pointerEvents: "all" }}>
                          {/* невидимая зона нажатия шире точки (Tooltip-курсор больше не перехватывает) */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={14}
                            fill="transparent"
                            style={{ cursor: "pointer" }}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onLinePointClick(label);
                            }}
                          />
                          <circle
                            cx={cx}
                            cy={cy}
                            r={5}
                            fill="#2563eb"
                            stroke="#fff"
                            strokeWidth={1}
                            style={{ pointerEvents: "none" }}
                          />
                        </g>
                      );
                    }}
                    activeDot={false}
                  />
                </LineChart>
              ) : (
                <Skeleton variant="rounded" height={280} />
              )}
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Нажмите на точку на линии, чтобы открыть список заказов за этот день.
          </Typography>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <PieChartIcon sx={{ color: "warning.main" }} fontSize="small" />
            Распределение по статусам
          </Typography>
          {pieData.length === 0 ? (
            <Typography color="text.secondary">Нет данных для диаграммы</Typography>
          ) : (
            <Box
              sx={{
                width: "100%",
                minWidth: 0,
                height: 300,
                minHeight: 300,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <PieChart width={340} height={280}>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx={170}
                  cy={140}
                  outerRadius={100}
                  paddingAngle={1}
                  onClick={(_, index) => {
                    const row = pieData[index];
                    if (row?.code) navigate(`/orders?status=${encodeURIComponent(row.code)}`);
                  }}
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} cursor="pointer" />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Клик по сегменту открывает список заказов с этим статусом.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
});
