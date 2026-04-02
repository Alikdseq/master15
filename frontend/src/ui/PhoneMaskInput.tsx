import * as React from "react";
import { IMaskInput } from "react-imask";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * MUI TextField `InputProps.inputComponent` for Russian mobile (+7) numbers.
 * Uses `react-imask` (React 19–compatible). Replaces `react-input-mask`, which relied on removed `findDOMNode`.
 */
export const PhoneMaskInput = React.forwardRef<HTMLInputElement, Props>(function PhoneMaskInput(props, ref) {
  const { onChange, onBlur, value, ...rest } = props;
  return (
    <IMaskInput
      {...rest}
      inputRef={ref}
      mask="+7 000 000-00-00"
      definitions={{ "0": /[0-9]/ }}
      lazy={false}
      placeholderChar="_"
      overwrite
      value={value == null ? "" : String(value)}
      onAccept={(masked: string) => {
        onChange?.({ target: { value: masked } } as React.ChangeEvent<HTMLInputElement>);
      }}
      onBlur={onBlur}
    />
  );
});
