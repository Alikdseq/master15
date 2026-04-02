import { Box, Button } from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import AssessmentIcon from "@mui/icons-material/Assessment";
import PhoneIcon from "@mui/icons-material/Phone";
import BuildIcon from "@mui/icons-material/Build";
import InventoryIcon from "@mui/icons-material/Inventory";
import { memo } from "react";
import { useNavigate } from "react-router-dom";
import type { UserRole } from "./types";

type Props = {
  role: UserRole;
};

export const QuickActions = memo(function QuickActions({ role }: Props) {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1.5,
        mt: 1,
        mb: 2,
      }}
    >
      {role === "admin" ? (
        <>
          <Button
            variant="outlined"
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => navigate("/orders/new")}
            sx={{ borderRadius: 999, textTransform: "none" }}
          >
            Новый заказ
          </Button>
          <Button
            variant="outlined"
            startIcon={<LocalShippingIcon />}
            onClick={() => navigate("/inventory")}
            sx={{ borderRadius: 999, textTransform: "none" }}
          >
            Поступление товара
          </Button>
          <Button
            variant="outlined"
            startIcon={<AssessmentIcon />}
            onClick={() => navigate("/reports")}
            sx={{ borderRadius: 999, textTransform: "none" }}
          >
            Отчёты
          </Button>
        </>
      ) : null}

      {role === "manager" ? (
        <>
          <Button
            variant="outlined"
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => navigate("/orders/new")}
            sx={{ borderRadius: 999, textTransform: "none" }}
          >
            Новый заказ
          </Button>
          <Button
            variant="outlined"
            startIcon={<PhoneIcon />}
            onClick={() => navigate("/clients")}
            sx={{ borderRadius: 999, textTransform: "none" }}
          >
            Клиенты
          </Button>
          <Button
            variant="outlined"
            startIcon={<AssessmentIcon />}
            onClick={() => navigate("/reports")}
            sx={{ borderRadius: 999, textTransform: "none" }}
          >
            Отчёты
          </Button>
        </>
      ) : null}

      {role === "master" ? (
        <>
          <Button
            variant="outlined"
            startIcon={<BuildIcon />}
            onClick={() => navigate("/orders?master=me")}
            sx={{ borderRadius: 999, textTransform: "none" }}
          >
            Мои заказы
          </Button>
          <Button
            variant="outlined"
            startIcon={<InventoryIcon />}
            onClick={() => navigate("/inventory")}
            sx={{ borderRadius: 999, textTransform: "none" }}
          >
            Склад
          </Button>
        </>
      ) : null}
    </Box>
  );
});
