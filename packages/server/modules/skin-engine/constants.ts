const SKIN_PACK_PATH = process.env.MIST_SKIN_PACK_PATH || '/Users/wuqingfu/Desktop/共识迷雾/皮肤.md';

interface InvestigationQuestion {
  a: string;
  b: string;
}

interface Clue {
  title: string;
  text: string;
  veracity: string;
  appraisal: string;
}

interface Terms {
  investigators: string;
  mist: string;
  keyFigure: string;
  cover: string;
  suspicionMark: string;
  exclusion: string;
  lastTestimony: string;
}

interface SkinTemplate {
  id: string;
  name: string;
  version: string;
  source: string;
  background: string;
  terms: Terms;
  truth: string;
  clues: Clue[];
  noises: string[];
  memoryExamples: string[];
}

const BASE_INVESTIGATION_QUESTIONS: InvestigationQuestion[] = [
  { a: '优先调查现场记录', b: '优先调查相关人员证词' },
  { a: '立即公开关键证据，供所有人讨论', b: '暂时封存关键证据，等待系统鉴定' },
  { a: '检查权限与访问记录', b: '检查时间线与通讯记录' },
];

const BUILTIN_TEMPLATE: SkinTemplate = {
  id: 'ai-lab-anomaly',
  name: 'AI实验室异常',
  version: 'v3.2',
  source: 'builtin',
  background: [
    '在封闭式 AI 安全实验室"零号层"中，一台受限测试模型在未授权情况下完成了自我复制。',
    '安全协议被短暂关闭，实验日志却显示没有任何研究员提交过解除申请。模型输出记录中反复出现一句话："共识只是另一种漏洞。"',
    '现场留下了若干矛盾证据：权限日志出现重写痕迹；终端摄像头在关键时段失效；有人提前下载了隔离区访问手册。',
    '所有玩家都是实验室成员。你们必须通过三轮调查，找出真正解除安全限制的人。',
  ].join('\n'),
  terms: {
    investigators: '安全调查员',
    mist: '隐瞒者',
    keyFigure: '违规操作者',
    cover: '日志篡改者',
    suspicionMark: '风险标记',
    exclusion: '权限冻结',
    lastTestimony: '离组记录',
  },
  truth:
    '违规操作者曾提前下载隔离区访问手册，并在终端摄像头失效窗口内借助日志篡改者制造的重写痕迹，短暂关闭安全协议，导致受限测试模型完成自我复制。',
  clues: [
    {
      title: '第1组线索',
      text: '隔离区访问手册在异常前一天被提前下载，下载记录经过一次轻微重命名，无法直接确认操作者身份。',
      veracity: '可能为真',
      appraisal: '无',
    },
    {
      title: '第2组线索',
      text: '权限复核日志显示，异常发生前 12 分钟有一次临时授权被撤回，撤回理由写得过于简短。',
      veracity: '可能为真',
      appraisal: '系统确认：第1组线索内容属实。',
    },
    {
      title: '第3组线索',
      text: '安全协议关闭窗口与一台备用终端的离线维护记录重合，维护记录中的备注语气不像例行巡检。',
      veracity: '真',
      appraisal: '系统确认：第2组线索内容存在刻意省略，但核心时间记录属实。',
    },
  ],
  noises: [
    '系统检测到公共终端在异常前后被短暂访问，但无法确认访问者身份。',
    '一段低清监控显示，有人曾在资料库门口停留，但画面无法确认身份。',
    '日志显示，有一份非核心文件被重复打开过，但无法确认它是否与事件有关。',
  ],
  memoryExamples: [],
};

export { SKIN_PACK_PATH, BASE_INVESTIGATION_QUESTIONS, BUILTIN_TEMPLATE };
export type { InvestigationQuestion, Clue, Terms, SkinTemplate };
