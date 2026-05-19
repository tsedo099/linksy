import { pollValidationMessage, validatePollForSubmit } from "@/lib/create-poll";
import { z } from "zod";

const baseShareFields = z.object({
  caption: z.string(),
  location: z.string(),
  fileCount: z.number().int().min(0),
  remoteCount: z.number().int().min(0),
  mediaAltTexts: z.array(z.string()),
  withPoll: z.boolean(),
  pollQuestion: z.string(),
  pollOptions: z.array(z.string()),
});

export const createPostShareClientSchema = baseShareFields.superRefine((val, ctx) => {
  const trimmedCaption = val.caption.trim();
  const mediaCount = val.fileCount + val.remoteCount;

  const pollCode = validatePollForSubmit(val.withPoll, val.pollQuestion, val.pollOptions);
  if (pollCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: pollValidationMessage(pollCode, "post"),
      path: ["pollQuestion"],
    });
    return;
  }

  const hasValidPoll = val.withPoll;
  if (mediaCount === 0 && !trimmedCaption && !hasValidPoll) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Add a caption, at least one image/video, or turn on a poll.",
      path: ["caption"],
    });
    return;
  }
});

export const createPostDraftClientSchema = z
  .object({
    caption: z.string(),
    fileCount: z.number().int().min(0),
    remoteCount: z.number().int().min(0),
  })
  .superRefine((val, ctx) => {
    if (!val.caption.trim() && val.fileCount === 0 && val.remoteCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a caption or media before saving a draft.",
        path: ["caption"],
      });
    }
  });
