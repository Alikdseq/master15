import { Box, Card, CardContent, Chip, Skeleton, Typography } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { memo } from "react";
import type { TopServiceRow } from "./types";

type Props = {
  items: TopServiceRow[] | undefined;
  loading: boolean;
};

export const TopServices = memo(function TopServices({ items, loading }: Props) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: "100%" }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, gap: 1, flexWrap: "wrap" }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <EmojiEventsIcon sx={{ color: "warning.main" }} fontSize="small" />
            Топ‑5 услуг / неисправностей
          </Typography>
          <Chip size="small" label="за 30 дней" variant="outlined" />
        </Box>
        {loading ? (
          <Skeleton variant="rectangular" height={200} />
        ) : !items?.length ? (
          <Typography color="text.secondary">Нет данных</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {items.map((s) => (
              <Box
                key={s.name}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  py: 1.5,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:last-of-type": { borderBottom: "none" },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {s.name}
                </Typography>
                <Chip size="small" label={`${s.count} заказов`} color="primary" variant="outlined" />
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
});
