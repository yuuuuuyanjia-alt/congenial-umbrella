<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
onLaunch(() => {
  console.log('出口风控小程序启动');
});
</script>

<style>
page {
  background: #f4f1ea;
  color: #1f2933;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif;
  font-size: $font-sm;
}
.wrap {
  padding: 24rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(15, 61, 46, 0.08);
}
.h1 {
  font-size: $font-h1;
  font-weight: 700;
  color: #0f3d2e;
}
.h2 {
  font-size: $font-h2;
  font-weight: 650;
  color: #0f3d2e;
  margin-bottom: 12rpx;
}
.muted {
  color: #6b7280;
  font-size: $font-sm;
  line-height: 1.6;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.badge {
  display: inline-block;
  font-size: $font-xs;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-weight: 600;
}
.badge-pass { background: #e3f4ea; color: #1f7a45; }
.badge-soft { background: #fff4d6; color: #9a6b00; }
.badge-review { background: #ffe8d6; color: #b54708; }
.badge-block { background: #fde8e6; color: #b42318; }
.badge-stub { background: #eef0f3; color: #4b5563; }
.badge-gate { background: #0f3d2e; color: #fff; }
.btn {
  background: #0f3d2e;
  color: #fff;
  text-align: center;
  padding: 20rpx;
  border-radius: 12rpx;
  font-size: $font-lg;
  margin-top: 16rpx;
}
.btn-ghost {
  background: #fff;
  color: #0f3d2e;
  border: 2rpx solid #0f3d2e;
}
.btn-danger { background: #b42318; }
.btn-warn { background: #b54708; }
.input {
  background: #f7f5f0;
  border-radius: 10rpx;
  padding: 16rpx 18rpx;
  margin-top: 10rpx;
  font-size: $font-md;
}
.label {
  margin-top: 18rpx;
  font-size: $font-sm;
  color: #374151;
  font-weight: 600;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
}
.chip {
  font-size: $font-xs;
  padding: 8rpx 16rpx;
  background: #e6efe9;
  color: #0f3d2e;
  border-radius: 8rpx;
}
.chip-on { background: #0f3d2e; color: #fff; }
.choice-row {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  margin-top: 12rpx;
}
.choice-btn {
  flex: 1;
  text-align: center;
  padding: 22rpx 12rpx;
  border-radius: 12rpx;
  background: #e6efe9;
  color: #0f3d2e;
  font-size: $font-lg;
  font-weight: 650;
  border: 2rpx solid #c5d4cb;
  box-sizing: border-box;
}
.choice-btn-on {
  background: #0f3d2e;
  color: #fff;
  border-color: #0f3d2e;
}
.err {
  background: #fde8e6;
  color: #7a1d16;
  padding: 16rpx;
  border-radius: 12rpx;
  font-size: $font-sm;
  margin-top: 12rpx;
  line-height: 1.55;
}
.ok {
  background: #e3f4ea;
  color: #14532d;
  padding: 16rpx;
  border-radius: 12rpx;
  font-size: $font-sm;
  margin-top: 12rpx;
}
.input[disabled] {
  color: #6b7280;
  opacity: 1;
}
</style>
