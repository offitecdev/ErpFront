import { roomInitials } from './chatFormat';

/** Neutrale Raumkachel: zwei Buchstaben auf grauer Fläche (kein Farbton). */
export const ChatRoomTile = ({ name, size = 'md' }: { name: string; size?: 'md' | 'sm' }) => (
    <span className={`ofi-gv-chat-tile ${size === 'sm' ? 'is-sm' : ''}`} aria-hidden>
        {roomInitials(name)}
    </span>
);
