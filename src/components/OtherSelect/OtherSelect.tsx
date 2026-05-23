import { useApp } from '../../hooks/useApp';
import './OtherSelect.css';

interface OtherSelectProps {
  id: string;
  label: string;
  options: string[];
  value: string;
  otherValue: string;
  onChange: (value: string) => void;
  onOtherChange: (value: string) => void;
  otherPlaceholder?: string;
}

export default function OtherSelect({
  id,
  label,
  options,
  value,
  otherValue,
  onChange,
  onOtherChange,
  otherPlaceholder = 'Please specify...',
}: OtherSelectProps) {
  const { t } = useApp();
  const otherOption = options[options.length - 1];
  const isOther = value === otherOption;

  return (
    <div className="other-select-wrapper generator-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{t(opt)}</option>
        ))}
      </select>
      {isOther && (
        <input
          type="text"
          className="input-field other-select-input"
          placeholder={otherPlaceholder}
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  );
}
