import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { PhoneMaskInput } from "../../../ui/PhoneMaskInput";
import { api } from "../../../lib/api";
import { createClientSchema, type CreateClientFormValues } from "../clientSchemas";
import { normalizePhoneRu } from "../../orders/createOrderSchema";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
};

export function CreateClientDialog({ open, onClose, onCreated }: Props) {
  const form = useForm<CreateClientFormValues>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      type: "person",
      name: "",
      phone: "",
      email: "",
      address: "",
      comment: "",
    },
  });

  const onSubmit = form.handleSubmit(async (vals) => {
    try {
      const phone = normalizePhoneRu(vals.phone);
      const r = await api.post("/clients/", {
        type: vals.type,
        name: vals.name.trim(),
        phone,
        email: vals.email.trim(),
        address: vals.address.trim(),
        comment: vals.comment.trim(),
        tags: [],
      });
      onCreated(r.data.id as number);
      onClose();
      form.reset();
    } catch (e: unknown) {
      const detail =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      form.setError("root", { message: typeof detail === "string" ? detail : "Не удалось создать клиента" });
    }
  });

  return (
    <Dialog
      open={open}
      onClose={() => {
        form.reset();
        onClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Новый клиент</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
        {form.formState.errors.root ? (
          <Alert severity="error">{form.formState.errors.root.message}</Alert>
        ) : null}
        <FormControl fullWidth>
          <InputLabel>Тип</InputLabel>
          <Select
            label="Тип"
            value={form.watch("type")}
            onChange={(e) => form.setValue("type", e.target.value as "person" | "company")}
          >
            <MenuItem value="person">Частное лицо</MenuItem>
            <MenuItem value="company">Организация</MenuItem>
          </Select>
        </FormControl>
        <TextField label="ФИО / название" required {...form.register("name")} error={!!form.formState.errors.name} helperText={form.formState.errors.name?.message} />
        <Controller
          name="phone"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Телефон"
              required
              fullWidth
              error={!!form.formState.errors.phone}
              helperText={form.formState.errors.phone?.message}
              InputProps={{ inputComponent: PhoneMaskInput }}
            />
          )}
        />
        <TextField label="Email" {...form.register("email")} error={!!form.formState.errors.email} helperText={form.formState.errors.email?.message} />
        <TextField label="Адрес" multiline minRows={2} {...form.register("address")} />
        <TextField label="Комментарий" multiline minRows={2} {...form.register("comment")} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" onClick={() => void onSubmit()} disabled={form.formState.isSubmitting}>
          Создать
        </Button>
      </DialogActions>
    </Dialog>
  );
}
