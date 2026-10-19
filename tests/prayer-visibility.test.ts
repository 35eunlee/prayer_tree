import assert from "node:assert/strict";
import test from "node:test";
import { canViewPrayer } from "../lib/prayer-visibility.ts";

const base = {
  viewerId: "viewer",
  activeFriend: true,
  memberGroupIds: ["group-a"],
};

test("friends-only prayer is visible to an active friend", () => {
  assert.equal(canViewPrayer({ ...base, visibility: "friends", friendShared: true }), true);
});

test("group-only prayer is visible to a current member", () => {
  assert.equal(canViewPrayer({ ...base, visibility: "groups", groupIds: ["group-a"] }), true);
});

test("friends-and-groups prayer is visible through either current audience", () => {
  assert.equal(canViewPrayer({ ...base, visibility: "friends_groups", groupIds: ["group-a"] }), true);
  assert.equal(canViewPrayer({ ...base, visibility: "friends_groups", activeFriend: false, groupIds: ["elsewhere"], friendShared: true }), false);
  assert.equal(canViewPrayer({ ...base, visibility: "friends_groups", activeFriend: false, groupIds: ["elsewhere"], friendIds: ["viewer"] }), false);
});

test("private prayer stays private even when its tree is shared with friends", () => {
  assert.equal(canViewPrayer({
    ...base,
    visibility: "private",
    friendShared: true,
    treeSharedToFriends: true,
    groupIds: ["group-a"],
    friendIds: ["viewer"],
  }), false);
});

test("friend access ends when the friendship is removed", () => {
  assert.equal(canViewPrayer({ ...base, visibility: "friends", friendShared: true, activeFriend: false }), false);
});

test("group access ends when membership is removed", () => {
  assert.equal(canViewPrayer({ ...base, visibility: "groups", groupIds: ["group-a"], memberGroupIds: [] }), false);
});

test("a group-scoped request only returns prayers shared with that group", () => {
  assert.equal(canViewPrayer({ ...base, visibility: "friends", friendShared: true, requestedGroupId: "group-a" }), false);
  assert.equal(canViewPrayer({ ...base, visibility: "friends_groups", groupIds: ["group-a"], requestedGroupId: "group-a" }), true);
});
