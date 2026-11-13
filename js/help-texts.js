/**
 * 说明气泡文案（i 气泡）——纯数据；键 = 设置字段名（设置页），或通用提示键（如 boostMultiplier）
 *
 * 只写「是什么、怎么用」，不写内部演化与实现口径（AGENTS「界面文案」条）。
 * 消费方：settings.js（扫描 #settings-modal [data-help] 自动插入 i 按钮与气泡）；
 *         progress.js（首页国服加速道具行尾的倍率提示，动态插 i）。
 * 新增说明：这里加一条 + 对应行加 data-help="键"（设置页）或在渲染处取键，契约测试会校验。
 */
(function (global) {
    'use strict';

    const CocTool = global.CocTool = global.CocTool || {};

    CocTool.helpTexts = {
        chestDetect: '账号数据里检测到宝箱刷新时进行首页提示。',
        autoImport: '复制游戏导出的账号 JSON 后打开 App，会自动读取剪贴板并导入。',
        replaceClipboardOnImport: '导入成功后，把剪贴板里的长 JSON 替换为「小工具超好用」（好吧，我夹带私货），避免之后粘贴卡顿。',
        nightMode: '设置睡眠时间后，完成时间落在最近的睡眠时段内的升级会高亮显示，方便提前安排。',
        darkMode: '控制浅色 / 深色外观，可跟随系统或手动切换。',
        vibrate: '在滑动切号、长按等操作时提供轻微震动。',
        boostMultiplier: '点击道具图标可以切换道具倍率。'
    };
})(window);
