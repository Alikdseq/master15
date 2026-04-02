import { Box, type BoxProps } from "@mui/material";
import { STATUS_COLORS, type OrderStatusCode } from "./status";

export type StatusBadgeProps = Omit<BoxProps, "children"> & {
  label: string;
  code?: OrderStatusCode | null;
};

export function StatusBadge({ label, code, sx, ...rest }: StatusBadgeProps) {
  const c = (code ? STATUS_COLORS[code] : null) ?? {
    bg: "#F1F5F9",
    fg: "#334155",
    dot: "#94A3B8",
  };

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: "4px",
        borderRadius: 999,
        backgroundColor: c.bg,
        color: c.fg,
        fontSize: 12,
        lineHeight: "16px",
        fontWeight: 600,
        ...sx,
      }}
      {...rest}
    >
      <Box component="span" sx={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.dot ?? c.fg }} />
      {label}
    </Box>
  );
}

