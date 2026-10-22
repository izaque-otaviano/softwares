/**
 * Barrel do kit de componentes. Importe sempre daqui: `import { Button, Table } from '@/components/ui'`.
 * Auxiliares internos (dialogShared, fieldUtils, colorContrast, testTokens, table/*) não fazem parte da API pública.
 */

export { Avatar, AVATAR_PALETTE, avatarColorIndex, initialsOf } from './Avatar';
export type { AvatarProps } from './Avatar';

export { Badge } from './Badge';
export type { BadgeProps, BadgeSize, BadgeTone } from './Badge';

export { Banner } from './Banner';
export type { BannerProps, BannerTone } from './Banner';

export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';

export { Combobox } from './Combobox';
export type { ComboboxProps, ComboOption } from './Combobox';

export { Drawer } from './Drawer';
export type { DrawerProps } from './Drawer';

export { EmptyIllustration } from './EmptyIllustrations';
export type { EmptyIllustrationName, EmptyIllustrationProps } from './EmptyIllustrations';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Field } from './Field';
export type { FieldProps } from './Field';

export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonSize, IconButtonVariant } from './IconButton';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Kebab } from './Kebab';
export type { KebabProps } from './Kebab';

export { Menu, MenuContent, MenuItem, MenuItems, MenuLabel, MenuSeparator, MenuTrigger, normalizeMenuItems } from './Menu';
export type {
  MenuContentProps,
  MenuItemProps,
  MenuItemSpec,
  MenuItemsProps,
  MenuLabelProps,
  MenuProps,
  MenuSeparatorProps,
  NormalizedMenuItem,
} from './Menu';

export { ConfirmModal, Modal } from './Modal';
export type { ConfirmModalProps, ModalProps, ModalSize } from './Modal';

export { Pill } from './Pill';
export type { PillProps, PillTone } from './Pill';

export { Select } from './Select';
export type { SelectOption, SelectProps } from './Select';

export { Skeleton, SkeletonRows, SkeletonText } from './Skeleton';
export type { SkeletonProps, SkeletonRowsProps, SkeletonTextProps } from './Skeleton';

export { SlaPill } from './SlaPill';
export type { SlaPillProps, SlaTarget } from './SlaPill';

export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

export { SplitButton } from './SplitButton';
export type { SplitButtonProps, SplitItem } from './SplitButton';

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps } from './StatusBadge';

export { PRESENCE_LABEL, StatusDot } from './StatusDot';
export type { Presence, StatusDotProps } from './StatusDot';

export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

export { ColumnsMenu, Table, useTableColumns } from './Table';
export type {
  ColumnDef,
  ColumnsMenuProps,
  SortDirection,
  SortState,
  TableEmptyConfig,
  TableErrorConfig,
  TableGroup,
  TableProps,
  UseTableColumnsResult,
} from './Table';

export { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
export type { TabsContentProps, TabsListProps, TabsProps, TabsTriggerProps } from './Tabs';

export { TagInput } from './TagInput';
export type { TagInputProps } from './TagInput';

export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';

export { ToastViewport } from './Toast';
export type { ToastViewportProps } from './Toast';

export { Tooltip, TooltipProvider } from './Tooltip';
export type { TooltipProps } from './Tooltip';
