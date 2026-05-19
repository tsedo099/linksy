"use client";

export type PollVariant = "story" | "post";

export type CreatePollEditorProps = {
  variant: PollVariant;
  withPoll: boolean;
  onTogglePoll: () => void;
  pollQuestion: string;
  onPollQuestionChange: (value: string) => void;
  pollOptions: string[];
  onPollOptionsChange: (next: string[]) => void;
  pollDurationHours: number;
  onPollDurationHoursChange: (hours: number) => void;
};

const DURATION_OPTIONS = [
  { hours: 24, label: "24h" },
  { hours: 48, label: "2d" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
] as const;

export function CreatePollEditor({
  variant,
  withPoll,
  onTogglePoll,
  pollQuestion,
  onPollQuestionChange,
  pollOptions,
  onPollOptionsChange,
  pollDurationHours,
  onPollDurationHoursChange,
}: CreatePollEditorProps) {
  const inputCls = variant === "story" ? "se-poll-input" : "st-field-in";
  const actionsCls = variant === "story" ? "se-poll-row" : "st-poll-actions";
  const addBtnCls = variant === "story" ? "se-poll-mini-btn" : "st-poll-btn";
  const trimmedOptions = pollOptions.map((option) => option.trim()).filter(Boolean);
  const duplicateOptionKeys = new Set<string>();
  const seenOptionKeys = new Set<string>();
  for (const option of trimmedOptions) {
    const key = option.toLowerCase();
    if (seenOptionKeys.has(key)) duplicateOptionKeys.add(key);
    seenOptionKeys.add(key);
  }

  function updateOption(index: number, value: string) {
    onPollOptionsChange(pollOptions.map((option, i) => (i === index ? value : option)));
  }

  function addOption() {
    if (pollOptions.length < 4) onPollOptionsChange([...pollOptions, ""]);
  }

  function removeOption(index: number) {
    if (pollOptions.length <= 2) return;
    onPollOptionsChange(pollOptions.filter((_, i) => i !== index));
  }

  const durationControl =
    variant === "story" ? (
      <div className="se-poll-duration" aria-label="Poll duration">
        {DURATION_OPTIONS.map((option) => (
          <button
            key={option.hours}
            type="button"
            className={`se-poll-duration-btn${pollDurationHours === option.hours ? " se-poll-duration-btn--on" : ""}`}
            onClick={() => onPollDurationHoursChange(option.hours)}
          >
            {option.label}
          </button>
        ))}
      </div>
    ) : (
      <label className="st-poll-duration">
        Ends in
        <select
          value={pollDurationHours}
          onChange={(event) => onPollDurationHoursChange(Number(event.target.value))}
        >
          <option value={24}>24 hours</option>
          <option value={48}>2 days</option>
          <option value={72}>3 days</option>
          <option value={168}>7 days</option>
        </select>
      </label>
    );

  const fields = withPoll ? (
    <div className={variant === "story" ? "se-poll-fields" : "st-poll-fields"}>
      {variant === "story" ? (
        <div className="se-poll-meta-row">
          <span>{trimmedOptions.length}/4 options</span>
          <span>{pollQuestion.trim().length}/240</span>
        </div>
      ) : null}
      <input
        className={inputCls}
        placeholder="Ask a question..."
        value={pollQuestion}
        onChange={(event) => onPollQuestionChange(event.target.value)}
        maxLength={240}
        aria-label="Poll question"
      />
      {pollOptions.map((value, index) => (
        <div key={index} className={variant === "story" ? "se-poll-option-row" : undefined}>
          {variant === "story" ? <span className="se-poll-option-index">{index + 1}</span> : null}
          <input
            className={`${inputCls}${duplicateOptionKeys.has(value.trim().toLowerCase()) ? " se-poll-input--error" : ""}`}
            placeholder={`Option ${index + 1}`}
            value={value}
            onChange={(event) => updateOption(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && pollOptions.length < 4 && value.trim()) {
                event.preventDefault();
                addOption();
              }
            }}
            maxLength={80}
            aria-label={`Poll option ${index + 1}`}
          />
          {variant === "story" && pollOptions.length > 2 ? (
            <button
              type="button"
              className="se-poll-option-remove"
              onClick={() => removeOption(index)}
              aria-label={`Remove option ${index + 1}`}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      <div className={actionsCls}>
        {pollOptions.length < 4 ? (
          <button type="button" className={addBtnCls} onClick={addOption}>
            {variant === "story" ? "+ option" : "+ Add option"}
          </button>
        ) : null}
        {durationControl}
      </div>
      {variant === "story" && duplicateOptionKeys.size > 0 ? (
        <p className="se-poll-error">Options must be different.</p>
      ) : null}
    </div>
  ) : null;

  if (variant === "story") {
    return (
      <div className="se-poll-box">
        <div className="se-poll-head">
          <div className="se-poll-title-wrap">
            <span className="se-poll-title">Poll</span>
            <span className="se-poll-subtitle">{withPoll ? "Active" : "Off"}</span>
          </div>
          <button
            type="button"
            className={`se-poll-toggle${withPoll ? " se-poll-toggle--on" : ""}`}
            onClick={onTogglePoll}
            aria-pressed={withPoll}
          >
            {withPoll ? "Remove" : "Add"}
          </button>
        </div>
        {fields}
      </div>
    );
  }

  return (
    <div className="st-poll">
      <div className="st-poll-head">
        <p className="st-field-label">Poll</p>
        <button
          type="button"
          className={`st-poll-toggle${withPoll ? " st-poll-toggle--on" : ""}`}
          onClick={onTogglePoll}
        >
          {withPoll ? "On" : "Off"}
        </button>
      </div>
      {fields}
    </div>
  );
}
