export type PrayerVisibilityInput = {
  visibility: string;
  groupIds?: string[];
  friendIds?: string[];
  friendShared?: boolean;
  viewerId: string;
  activeFriend: boolean;
  memberGroupIds: string[];
  requestedGroupId?: string;
};

/**
 * Prayer visibility is evaluated independently from tree visibility.
 * Membership and friendship values must come from the current request's database reads.
 */
export function canViewPrayer(input: PrayerVisibilityInput): boolean {
  const allowsGroups = input.visibility === "groups" || input.visibility === "friends_groups";
  const allowsFriends = input.visibility === "friends" || input.visibility === "friends_groups";
  const prayerGroups = input.groupIds ?? [];
  const prayerFriends = input.friendIds ?? [];

  if (input.requestedGroupId) {
    return allowsGroups && prayerGroups.includes(input.requestedGroupId);
  }

  const groupAccess = allowsGroups && prayerGroups.some((id) => input.memberGroupIds.includes(id));
  const friendAccess =
    input.activeFriend &&
    allowsFriends &&
    (input.friendShared === true || prayerFriends.includes(input.viewerId));

  return groupAccess || friendAccess;
}
