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
}
.wrap {
  padding: 24rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(11, 58, 91, 0.06);
}
.h1 {
  font-size: 40rpx;
  font-weight: 700;
  color: #0b3a5b;
}
.h2 {
  font-size: 30rpx;
  font-weight: 650;
  color: #0b3a5b;
  margin-bottom: 12rpx;
}
.muted {
  color: #6b7280;
  font-size: 24rpx;
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
  font-size: 22rpx;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-weight: 600;
}
.badge-pass { background: #e3f4ea; color: #1f7a45; }
.badge-soft { background: #fff4d6; color: #9a6b00; }
.badge-review { background: #ffe8d6; color: #b54708; }
.badge-block { background: #fde8e6; color: #b42318; }
.badge-stub { background: #eef0f3; color: #4b5563; }
.badge-gate { background: #0b3a5b; color: #fff; }
.btn {
  background: #0b3a5b;
  color: #fff;
  text-align: center;
  padding: 20rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  margin-top: 16rpx;
}
.btn-ghost {
  background: #fff;
  color: #0b3a5b;
  border: 2rpx solid #0b3a5b;
}
.btn-danger { background: #b42318; }
.btn-warn { background: #b54708; }
.input {
  background: #f7f5f0;
  border-radius: 10rpx;
  padding: 16rpx 18rpx;
  margin-top: 10rpx;
  font-size: 26rpx;
}
.label {
  margin-top: 18rpx;
  font-size: 24rpx;
  color: #374151;
  font-weight: 600;
}
.chip {
  font-size: 22rpx;
  padding: 8rpx 16rpx;
  background: #e8eef3;
  color: #0b3a5b;
  border-radius: 8rpx;
  margin-right: 10rpx;
  margin-bottom: 8rpx;
}
.chip-on { background: #0b3a5b; color: #fff; }
.err {
  background: #fde8e6;
  color: #7a1d16;
  padding: 16rpx;
  border-radius: 12rpx;
  font-size: 24rpx;
  margin-top: 12rpx;
  line-height: 1.55;
}
.ok {
  background: #e3f4ea;
  color: #14532d;
  padding: 16rpx;
  border-radius: 12rpx;
  font-size: 24rpx;
  margin-top: 12rpx;
}
</style>
