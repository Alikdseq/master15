import { Box, type BoxProps, Button, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

export type PageHeaderProps = BoxProps & {
  title: string;
  subtitle?: string;
  cta?: { label: string; to: string };
  rightSlot?: ReactNode;
};

export function PageHeader({ title, subtitle, cta, rightSlot, sx, ...rest }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: { xs: "stretch", sm: "center" },
        justifyContent: "space-between",
        gap: 2,
        flexWrap: "wrap",
        ...sx,
      }}
      {...rest}
    >
      <Box sx={{ minWidth: 240 }}>
        <Typography variant="h6">{title}</Typography>
        {subtitle ? (
          <Typography variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {rightSlot}
        {cta ? (
          <Button variant="contained" component={RouterLink} to={cta.to}>
            {cta.label}
          </Button>
        ) : null}
      </Box>
    </Box>
  );
}

