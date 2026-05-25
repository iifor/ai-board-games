import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { SelectOption, FilterState } from './api';

export interface EntityModalProps {
  open: boolean;
  title: string;
  initialValues?: Record<string, unknown>;
  width?: number;
  onCancel: () => void;
  onSave: (values: Record<string, unknown>) => void;
  children: ReactNode;
}

export interface ListFilterSelect {
  key: string;
  placeholder?: string;
  options: SelectOption[];
  width?: number;
}

export interface ListFilterBarProps {
  value?: FilterState;
  onChange?: Dispatch<SetStateAction<FilterState>>;
  searchPlaceholder?: string;
  selects?: ListFilterSelect[];
}

export interface TableActionsProps {
  onEdit?: () => void;
  editText?: string;
  onDelete?: () => void;
  deleteText?: string;
}

export interface AvatarUploadProps {
  value?: string;
  onChange?: (url: string) => void;
}
