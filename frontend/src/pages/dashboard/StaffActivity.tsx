import { Box, Card, CardContent, Typography } from "@mui/material";
import GroupIcon from "@mui/icons-material/Group";
import { memo } from "react";
import type { ActivityRow } from "./types";

type Props = {
  items: ActivityRow[] | null | undefined;
  loading: boolean;
};

export const StaffActivity = memo(function StaffActivity({ items, loading }: Props) {
  if (loading) return null;
  if (!items?.length) return null;

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <GroupIcon color="primary" fontSize="small" />
          Активность мастеров (7 дней)
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {items.map((m) => (
            <Box
              key={m.name}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                py: 1.5,
                borderBottom: "1px solid",
                borderColor: "divider",
                "&:last-of-type": { borderBottom: "none" },
              }}
            >
              <Typography variant="body2">{m.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {m.completed} заказов
                {m.avg_days != null ? ` · ср. ${m.avg_days} дн.` : ""}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
});
