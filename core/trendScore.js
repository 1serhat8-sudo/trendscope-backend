function calculateTrendScore(video) {
  const hoursSincePublished = Math.max(
    (Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60),
    1
  );

  const viewsPerHour = video.viewCount ? video.viewCount / hoursSincePublished : 0;
  const likeRatio = video.likeCount && video.dislikeCount !== undefined
    ? video.likeCount / (video.likeCount + video.dislikeCount || 1)
    : 0.5;

  const freshnessBoost = hoursSincePublished <= 24 ? 10 : 0;

  const score = (viewsPerHour * 0.6) + (likeRatio * 100 * 0.3) + (freshnessBoost * 0.1);
  return Math.round(score * 100) / 100;
}

module.exports = { calculateTrendScore };
