"use client";

import { LocationAutocompleteInput } from "@/components/location-autocomplete-input";
import { displayMediaSrc } from "@/lib/media";
import type { Dispatch, SetStateAction } from "react";
import type { CreateStrings } from "./create-strings";
import { IcPin, IcTag, IcX, type TagUser } from "./create-primitives";

export function CreateMetadataFields({
  location,
  setLocation,
  cs,
  tagPickerOpen,
  setTagPickerOpen,
  tagQuery,
  setTagQuery,
  tagSearching,
  tagResults,
  taggedUsers,
  addTaggedUser,
  removeTaggedUser,
}: {
  location: string;
  setLocation: (v: string) => void;
  cs: CreateStrings;
  tagPickerOpen: boolean;
  setTagPickerOpen: Dispatch<SetStateAction<boolean>>;
  tagQuery: string;
  setTagQuery: (v: string) => void;
  tagSearching: boolean;
  tagResults: TagUser[];
  taggedUsers: TagUser[];
  addTaggedUser: (user: TagUser) => void;
  removeTaggedUser: (userId: string) => void;
}) {
  return (
    <div className="st-fields">
      <label className="st-field">
        <span className="st-field-ic"><IcPin /></span>
        <LocationAutocompleteInput
          value={location}
          onChange={setLocation}
          placeholder={cs.locPlaceholder}
          maxLength={80}
          inputClassName="st-field-in"
          aria-label={cs.locAria}
        />
      </label>
      <div className="st-field st-tag-field">
        <span className="st-field-ic"><IcTag /></span>
        <div className="st-tag-main">
          <button
            type="button"
            className="st-tag-trigger"
            onClick={() => setTagPickerOpen((value) => !value)}
            aria-expanded={tagPickerOpen}
          >
            <span>{taggedUsers.length ? cs.tagged : cs.tagPeople}</span>
            <small>{taggedUsers.length}/5</small>
          </button>
          {taggedUsers.length > 0 ? (
            <div className="st-tag-chips" aria-label={cs.tagged}>
              {taggedUsers.map((user) => (
                <span key={user.id} className="st-tag-chip">
                  <span className="st-tag-chip-avatar">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayMediaSrc(user.avatarUrl) ?? user.avatarUrl} alt="" />
                    ) : user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  @{user.username}
                  <button type="button" onClick={() => removeTaggedUser(user.id)} aria-label={cs.removeUserFmt(user.username)}>
                    <IcX />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {tagPickerOpen ? (
            <div className="st-tag-picker">
              <input
                className="st-field-in st-tag-search"
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setTagPickerOpen(false);
                    setTagQuery("");
                  }
                  if (event.key === "Enter" && tagResults[0]) {
                    event.preventDefault();
                    addTaggedUser(tagResults[0]);
                  }
                }}
                placeholder={cs.tagSearchPlaceholder}
                autoComplete="off"
                autoFocus
              />
              <div className="st-tag-results">
                {!tagQuery.trim() ? <span className="st-tag-empty">{cs.tagSearchEmpty}</span> : null}
                {tagSearching ? <span className="st-tag-empty">{cs.tagSearching}</span> : null}
                {!tagSearching && tagQuery.trim() && tagResults.length === 0 ? (
                  <span className="st-tag-empty">{cs.tagNoResults}</span>
                ) : null}
                {tagResults.map((user) => (
                  <button key={user.id} type="button" className="st-tag-option" onClick={() => addTaggedUser(user)}>
                    <span className="st-tag-option-avatar">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={displayMediaSrc(user.avatarUrl) ?? user.avatarUrl} alt="" />
                      ) : user.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{user.displayName}</strong>
                      <small>@{user.username}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
