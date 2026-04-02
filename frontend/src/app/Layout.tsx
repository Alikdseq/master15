import { useMemo, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { useAuth } from "./AuthContext";
import { Outlet } from "react-router-dom";

type NavItem = { to: string; label: string; roles?: Array<"admin" | "manager" | "master"> };

function pathMatchesItem(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}

export function Layout() {
  const { state, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = useMemo<NavItem[]>(
    () => [
      { to: "/dashboard", label: "Дашборд" },
      { to: "/orders", label: "Заказы" },
      { to: "/clients", label: "Клиенты" },
      { to: "/inventory", label: "Склад" },
      { to: "/reports", label: "Отчёты", roles: ["admin", "manager", "master"] },
      { to: "/admin", label: "Администрирование", roles: ["admin"] },
    ],
    []
  );

  const filtered = items.filter((it) => !it.roles || (state.role ? it.roles.includes(state.role) : false));
  const drawerWidth = 280;

  const desktopNav = (
    <Box
      sx={{
        display: { xs: "none", md: "flex" },
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 0.5,
        flex: 1,
        minWidth: 0,
        px: 1,
      }}
    >
      {filtered.map((it) => {
        const selected = pathMatchesItem(loc.pathname, it.to);
        return (
          <Button
            key={it.to}
            component={RouterLink}
            to={it.to}
            color="inherit"
            size="large"
            sx={{
              fontWeight: selected ? 700 : 500,
              fontSize: "1rem",
              opacity: selected ? 1 : 0.92,
              borderBottom: selected ? 2 : 0,
              borderColor: "common.white",
              borderRadius: 0,
              py: 1.25,
              px: 1.5,
            }}
          >
            {it.label}
          </Button>
        );
      })}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="fixed">
        <Toolbar sx={{ gap: 1, flexWrap: "wrap", py: { xs: 0.5, md: 0.75 } }}>
          {isMobile ? (
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 0.5 }}
              color="inherit"
              aria-label="Открыть меню"
            >
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography variant="h6" component="div" sx={{ flexShrink: 0, fontSize: { md: "1.15rem" } }}>
            Мастер Принт CRM
          </Typography>
          {desktopNav}
          <Typography variant="body2" sx={{ ml: { xs: 0, md: "auto" }, opacity: 0.95, flexShrink: 0, fontSize: "0.9rem" }}>
            {state.email} {state.role ? `(${state.role})` : ""}
          </Typography>
          <Button
            color="inherit"
            size="large"
            sx={{ flexShrink: 0 }}
            onClick={() => {
              logout();
              nav("/login");
            }}
          >
            Выйти
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={isMobile && mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto", px: 0.5, pb: 1 }}>
          <List>
            {filtered.map((it) => (
              <ListItemButton
                key={it.to}
                component={RouterLink}
                to={it.to}
                selected={pathMatchesItem(loc.pathname, it.to)}
                onClick={() => setMobileOpen(false)}
              >
                <ListItemText primary={it.label} primaryTypographyProps={{ fontSize: "1.05rem" }} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, width: "100%", minWidth: 0 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
