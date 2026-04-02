import { alpha } from "@mui/material/styles";
import { Alert, Box, Button, Container, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { mpBrand } from "../app/theme";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: `linear-gradient(165deg, ${alpha(mpBrand.blue.main, 0.14)} 0%, ${alpha(mpBrand.yellow.main, 0.08)} 28%, #f5f7fa 52%)`,
      }}
    >
    <Container maxWidth="sm" sx={{ pt: 10, pb: 6 }}>
      <Paper sx={{ p: 4, borderTop: `4px solid ${mpBrand.blue.main}` }}>
        <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 800, color: mpBrand.blue.main }}>
          Мастер Принт
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Вход в CRM
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box
          component="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              await login(email, password);
              nav("/orders");
            } catch (err: any) {
              setError(err?.response?.data?.detail ?? "Не удалось войти");
            } finally {
              setLoading(false);
            }
          }}
        >
          <TextField fullWidth label="Email" value={email} onChange={(e) => setEmail(e.target.value)} sx={{ mb: 2 }} />
          <TextField
            fullWidth
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button type="submit" variant="contained" disabled={loading}>
            Войти
          </Button>
        </Box>
      </Paper>
    </Container>
    </Box>
  );
}

