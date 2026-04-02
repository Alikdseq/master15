import { alpha, createTheme } from "@mui/material/styles";
import type { Shadows } from "@mui/material/styles";
import type {} from "@mui/x-data-grid/themeAugmentation";

/**
 * Цвета бренда «Мастер Принт» (вывеска: синий текст на жёлтом + CMYK-капли).
 * Primary — синий шрифта; secondary — жёлтый фона вывески (акценты).
 */
export const mpBrand = {
  blue: {
    main: "#1A56A3",
    dark: "#154A8A",
    light: "#3D7CC9",
  },
  yellow: {
    main: "#FFEB3B",
    dark: "#F5D000",
    /** Текст на жёлтой кнопке / чипе */
    contrast: "#231F20",
  },
  /** Палитра для графиков (CMYK + синий бренда) */
  chart: ["#00AEEF", "#EC008C", "#FFF200", "#231F20", "#1A56A3", "#7CB342"] as const,
} as const;

const palette = {
  background: {
    default: "#F5F7FA",
    paper: "#FFFFFF",
  },
  divider: "#E2E8F0",
  text: {
    primary: "#231F20",
    secondary: "#64748B",
  },
  primary: {
    main: mpBrand.blue.main,
    dark: mpBrand.blue.dark,
    light: mpBrand.blue.light,
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: mpBrand.yellow.main,
    dark: mpBrand.yellow.dark,
    light: "#FFF9C4",
    contrastText: mpBrand.yellow.contrast,
  },
  info: { main: "#00AEEF" },
  success: { main: "#2E7D32" },
  warning: { main: "#F9A825" },
  error: { main: "#C62828" },
} as const;

export const mpTheme = createTheme({
  palette: {
    mode: "light",
    ...palette,
  },
  typography: {
    fontFamily: [
      "Inter",
      "system-ui",
      "-apple-system",
      '"Segoe UI"',
      "Roboto",
      "Arial",
      "sans-serif",
    ].join(","),
    h5: { fontWeight: 700, fontSize: 24, lineHeight: "32px" },
    h6: { fontWeight: 700, fontSize: 20, lineHeight: "28px" },
    subtitle1: { fontWeight: 600, fontSize: 16, lineHeight: "24px" },
    body1: { fontWeight: 400, fontSize: 14, lineHeight: "20px" },
    body2: { fontWeight: 400, fontSize: 12, lineHeight: "16px" },
    button: { fontWeight: 600, textTransform: "none", fontSize: 14, lineHeight: "20px" },
  },
  shape: { borderRadius: 12 },
  shadows: (() => {
    const s = Array(25).fill("none") as unknown as Shadows;
    s[1] = "0 1px 2px rgba(15, 23, 42, 0.06)";
    s[2] = "0 2px 6px rgba(15, 23, 42, 0.08)";
    s[3] = "0 4px 12px rgba(15, 23, 42, 0.10)"; // cards
    return s;
  })(),
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: palette.background.default,
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "primary" },
      styleOverrides: {
        root: {
          background: `linear-gradient(135deg, ${palette.primary.dark} 0%, ${palette.primary.main} 55%, ${palette.primary.light} 160%)`,
          borderBottom: "none",
          color: palette.primary.contrastText,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${palette.divider}`,
          backgroundColor: palette.background.paper,
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${palette.divider}`,
          borderRadius: 16,
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 12,
          minHeight: 40,
          paddingInline: 16,
        },
        containedPrimary: {
          backgroundColor: palette.primary.main,
          "&:hover": { backgroundColor: palette.primary.dark },
        },
        outlinedPrimary: {
          borderColor: palette.primary.main,
          "&:hover": {
            borderColor: palette.primary.dark,
            backgroundColor: alpha(palette.primary.main, 0.08),
          },
        },
        textPrimary: {
          "&:hover": { backgroundColor: alpha(palette.primary.main, 0.08) },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: palette.background.paper,
          borderRadius: 8,
          minHeight: 40,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: palette.divider,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#CBD5E1",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: palette.primary.main,
            borderWidth: 1,
          },
          "&.Mui-focused": {
            boxShadow: `0 0 0 3px ${alpha(palette.primary.main, 0.22)}`,
          },
        },
        input: { fontSize: 14 },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: palette.text.secondary },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          marginInline: 8,
          marginBlock: 2,
          "&.Mui-selected": {
            backgroundColor: alpha(palette.primary.main, 0.14),
            color: palette.primary.main,
          },
          "&.Mui-selected:hover": {
            backgroundColor: alpha(palette.primary.main, 0.22),
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: `1px solid ${palette.divider}`,
          borderRadius: 16,
          overflow: "hidden",
        },
        columnHeaders: {
          backgroundColor: alpha(palette.primary.main, 0.06),
          borderBottom: `1px solid ${palette.divider}`,
          color: palette.text.primary,
          fontWeight: 700,
        },
        row: {
          "&:nth-of-type(even)": { backgroundColor: "#F9FAFB" },
        },
        cell: {
          borderBottom: `1px solid ${palette.divider}`,
        },
      },
    },
  },
});

