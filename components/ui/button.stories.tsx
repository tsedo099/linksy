import type { Story } from "@ladle/react";
import { UiButton, type UiButtonProps } from "./button";

export default {
  title: "ui/Button",
};

export const Primary: Story<UiButtonProps> = (args) => <UiButton {...args}>Sign in</UiButton>;
Primary.args = { variant: "primary" };

export const Ghost: Story<UiButtonProps> = (args) => <UiButton {...args}>Cancel</UiButton>;
Ghost.args = { variant: "ghost" };

export const Unstyled: Story<UiButtonProps> = (args) => (
  <UiButton {...args}>Raw button (no preset class)</UiButton>
);
Unstyled.args = { variant: "unstyled" };

export const Disabled: Story<UiButtonProps> = (args) => <UiButton {...args}>Disabled</UiButton>;
Disabled.args = { variant: "primary", disabled: true };
