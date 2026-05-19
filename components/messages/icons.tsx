import {
  ChevronLeft,
  Forward,
  Info,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  Phone,
  Pin,
  Play,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Square,
  SquarePen,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";

const stroke = 1.8;

export const IcSearch = () => <Search size={15} strokeWidth={stroke} aria-hidden />;
export const IcCompose = () => <SquarePen size={17} strokeWidth={stroke} aria-hidden />;
export const IcSend = () => <Send size={17} strokeWidth={stroke} aria-hidden />;
export const IcBack = () => <ChevronLeft size={20} strokeWidth={stroke} aria-hidden />;
export const IcPhone = () => <Phone size={18} strokeWidth={stroke} aria-hidden />;
export const IcVideo = () => <Video size={18} strokeWidth={stroke} aria-hidden />;
export const IcEmoji = () => <Smile size={19} strokeWidth={stroke} aria-hidden />;
export const IcAttach = () => <Paperclip size={19} strokeWidth={stroke} aria-hidden />;
export const IcX = () => <X size={17} strokeWidth={2} aria-hidden />;
export const IcUsers = () => <Users size={18} strokeWidth={stroke} aria-hidden />;
export const IcInfo = () => <Info size={17} strokeWidth={stroke} aria-hidden />;
export const IcShieldCheck = () => <ShieldCheck size={17} strokeWidth={stroke} aria-hidden />;
export const IcMore = () => <MoreHorizontal size={16} strokeWidth={stroke} aria-hidden />;
export const IcReply = () => <Reply size={16} strokeWidth={stroke} aria-hidden />;
export const IcReact = () => <Smile size={16} strokeWidth={stroke} aria-hidden />;
export const IcPin = () => <Pin size={14} strokeWidth={stroke} aria-hidden />;
export const IcForward = () => <Forward size={14} strokeWidth={stroke} aria-hidden />;
export const IcTrash = () => <Trash2 size={14} strokeWidth={stroke} aria-hidden />;
export const IcMic = () => <Mic size={19} strokeWidth={stroke} aria-hidden />;
export const IcStop = () => <Square size={17} fill="currentColor" strokeWidth={0} aria-hidden />;
export const IcPlay = () => <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden />;
export const IcPause = () => <Pause size={14} fill="currentColor" strokeWidth={0} aria-hidden />;

export { stroke as ICON_STROKE };
