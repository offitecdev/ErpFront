/* The quote module's popup shell — the implementation moved to the app-wide
   kit (`components/ui-shared/PopupKit`) on 18.08.2026 when the project detail
   screen adopted the same two shapes. This file keeps the tender names so the
   quote popups read as before:

   • TenderFloatCard = PopupCard   — draggable, centred, no backdrop
   • TenderDialog    = PopupDialog — centred over a scrim, must be answered   */

export {
    PopupActions,
    PopupButton,
    PopupCaption,
    PopupCard as TenderFloatCard,
    PopupDialog as TenderDialog,
    PopupEmpty,
    PopupField,
    PopupKv,
    PopupMeter,
    PopupNote,
} from '@/components/ui-shared/PopupKit';

export type {
    PopupCardProps as TenderFloatCardProps,
    PopupDialogProps as TenderDialogProps,
    PopupTone,
} from '@/components/ui-shared/PopupKit';
