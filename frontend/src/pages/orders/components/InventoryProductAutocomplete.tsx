import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";

export type InventoryProductOption = { id: number; name: string; sku: string; unit?: string };

type Props = {
  value: InventoryProductOption | null;
  onChange: (next: InventoryProductOption | null) => void;
  disabled?: boolean;
  label?: string;
};

/**
 * Поиск товара на складе: запрос к API с debounce, без локальной фильтрации MUI
 * (иначе совпадения «по сходству» с сервера отсекаются клиентом).
 */
export function InventoryProductAutocomplete({
  value,
  onChange,
  disabled,
  label = "Товар",
}: Props) {
  const [inputValue, setInputValue] = useState(() => (value ? `${value.name} (${value.sku})` : ""));
  const [options, setOptions] = useState<InventoryProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedSearch = useDebouncedValue(inputValue.trim(), 300);

  const mergedOptions = useMemo(() => {
    if (!value) return options;
    if (options.some((o) => o.id === value.id)) return options;
    return [value, ...options];
  }, [options, value]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = { page_size: 50 };
        if (debouncedSearch) params.search = debouncedSearch;
        const r = await api.get("/inventory/products/", { params });
        if (cancelled) return;
        const rows = (r.data?.results ?? []) as Array<{
          id: number;
          name: string;
          sku: string;
          unit?: string;
        }>;
        setOptions(
          rows.map((x) => ({
            id: x.id,
            name: x.name,
            sku: x.sku,
            unit: x.unit,
          }))
        );
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    if (value) {
      setInputValue(`${value.name} (${value.sku})`);
    }
  }, [value?.id, value?.name, value?.sku]);

  return (
    <Autocomplete<InventoryProductOption, false, false, false>
      disabled={disabled}
      options={mergedOptions}
      loading={loading}
      value={value}
      onChange={(_, v) => {
        onChange(v);
        if (v) setInputValue(`${v.name} (${v.sku})`);
        else setInputValue("");
      }}
      inputValue={inputValue}
      onInputChange={(_, v, reason) => {
        if (reason === "reset") return;
        setInputValue(v);
      }}
      getOptionLabel={(o) => `${o.name} (${o.sku})`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={(opts) => opts}
      noOptionsText={loading ? "Загрузка…" : debouncedSearch ? "Ничего не найдено" : "Введите название или SKU"}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Начните вводить название или SKU"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={18} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
