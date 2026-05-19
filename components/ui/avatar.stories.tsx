import type { Story } from "@ladle/react";
import { UiAvatar, type UiAvatarProps } from "./avatar";

export default {
  title: "ui/Avatar",
};

const PURPLE_GRADIENT = "linear-gradient(135deg, #7c3aed, #4c1d95)";
const PINK_GRADIENT = "linear-gradient(135deg, #f472b6, #db2777)";

export const Small: Story<UiAvatarProps> = (args) => <UiAvatar {...args} />;
Small.args = { label: "Yu", size: "sm", gradient: PURPLE_GRADIENT };

export const Medium: Story<UiAvatarProps> = (args) => <UiAvatar {...args} />;
Medium.args = { label: "Yuri", size: "md", gradient: PURPLE_GRADIENT };

export const Large: Story<UiAvatarProps> = (args) => <UiAvatar {...args} />;
Large.args = { label: "Linksy", size: "lg", gradient: PINK_GRADIENT };

export const EmptyLabel: Story<UiAvatarProps> = (args) => <UiAvatar {...args} />;
EmptyLabel.args = { label: "", size: "md" };
