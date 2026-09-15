



/* ==================================================================
   安全本地存储写入 —— localStorage.setItem/removeItem 在隐私模式受限、
   存储被浏览器/企业策略/隐私扩展禁用、或容量超限等场景下会抛异常。这类
   异常发生在普通 addEventListener 回调里不会崩页面（只会打到控制台），
   但后果是用户以为设置保存了、实际上悄悄没保存——尤其是 API Key 这种
   "填一次以后不用再管"的场景，用户看到界面显示"已保存"，刷新后才发现
   丢了，会很困惑且毫无提示。这里统一包一层，失败时用已有的 toast 系统
   告诉用户，不再是"看起来保存了、其实没有"。
   下面所有用户直接触发的设置写入（摇卦频率日志、新手教程已读标记、人设/
   模型/回复风格/努力程度选择、单价覆盖、API Key、历史记录、终身统计）
   都改走这两个函数。
   例外：saveActiveConversation/clearActiveConversationStorage（当前会话
   自动存档，见对应小节）刻意不走这一层——那是刷新页面用的后台自动存档，
   原作者已经明确设计为"静默失败即可，不影响当前这次问答本身"，不需要用
   toast 打扰用户，这里保留原设计判断，没有改动那两个函数。
   ================================================================== */
let notifyStorage = () => {};

function configureStorageNotifications(notify){ notifyStorage = notify; }

function safeGetItem(key){try{return localStorage.getItem(key);}catch(e){return null;}}

function safeSetItem(key, val){
  try{
    localStorage.setItem(key, val);
    return true;
  }catch(e){
    notifyStorage(`设置没能保存到本地（${(e && e.message) || '存储失败'}），可能是隐私模式或存储空间限制`, 'error');
    return false;
  }
}

function safeRemoveItem(key){
  try{
    localStorage.removeItem(key);
    return true;
  }catch(e){
    notifyStorage(`清除本地设置失败（${(e && e.message) || '存储失败'}），可能是隐私模式限制`, 'error');
    return false;
  }
}

export { notifyStorage, configureStorageNotifications, safeGetItem, safeSetItem, safeRemoveItem };
