const weights = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function getPriorityNotifications(notifications, limit) {
  return [...notifications]
    .sort((a, b) => {
      const scoreA = weights[a.type] || 0;
      const scoreB = weights[b.type] || 0;

      if (scoreA !== scoreB) return scoreB - scoreA;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .slice(0, limit);
}

module.exports = getPriorityNotifications;
