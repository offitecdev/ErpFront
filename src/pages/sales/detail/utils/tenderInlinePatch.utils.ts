import type { PositionDto } from '../../../../types/tender';
import type { InlinePositionPatch } from '../types/tenderDetail.types';

// Treats empty string and undefined as null so a patch that only clears a field
// compares equal to an already-empty position value.
export const normalizeInlinePatchValue = (value: unknown) => (value == null || value === '' ? null : value);

// True when every field in the patch already matches the position — i.e. the
// staged inline edit is a no-op and can be treated as confirmed.
export const isInlinePatchConfirmed = (position: PositionDto, patch: InlinePositionPatch) =>
    (Object.entries(patch) as Array<[keyof InlinePositionPatch, InlinePositionPatch[keyof InlinePositionPatch]]>).every(([field, value]) =>
        normalizeInlinePatchValue(position[field]) === normalizeInlinePatchValue(value),
    );
