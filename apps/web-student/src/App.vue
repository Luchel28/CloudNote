<template>
  <main class="upload-page-shell">
    <section class="upload-panel">
      <div class="upload-brand-row">
        <div class="upload-brand">
          <img class="brand-logo" :src="logoUrl" alt="CloudNote logo" />
          <div>
            <p class="eyebrow">CLOUDNOTE</p>
            <h1>云笺</h1>
          </div>
        </div>
        <a class="upload-admin-link" href="/admin">班长后台</a>
      </div>

      <section class="upload-task-card" :class="{ 'is-home-state': isHomeState, 'is-receipt-visible': Boolean(receipt) }" aria-labelledby="uploadTaskName">
        <div class="upload-task-head">
          <div>
            <span class="upload-status-badge" :class="`status-${statusTone}`">{{ statusBadge }}</span>
            <h2 id="uploadTaskName">{{ taskTitle }}</h2>
          </div>
          <p v-if="taskMeta" class="assignment-meta">{{ taskMeta }}</p>
        </div>
        <p class="secondary-intro">{{ introText }}</p>
        <p class="upload-status-hint" :class="`status-${statusTone}`">{{ statusHint }}</p>
      </section>

      <section class="upload-form-card">
        <form class="upload-form-grid" @submit.prevent="handleSubmit">
          <section class="upload-section">
            <div class="upload-section-title">
              <span>01</span>
              <h3>填写信息</h3>
            </div>

            <div v-if="activeFields.length" class="upload-dynamic-fields">
              <template v-for="field in activeFields" :key="field.key">
                <label class="upload-field">
                  <span>{{ field.label }}<em v-if="field.required">*</em></span>

                  <template v-if="field.type === 'single_choice'">
                    <fieldset class="upload-choice">
                      <label v-for="option in optionsFor(field)" :key="option">
                        <input
                          v-model="fieldValues[field.key]"
                          type="radio"
                          :name="field.key"
                          :value="option"
                          :disabled="submitLocked"
                          @change="clearReceipt"
                        />
                        <span>{{ option }}</span>
                      </label>
                    </fieldset>
                  </template>

                  <template v-else-if="field.type === 'multiple_choice'">
                    <fieldset class="upload-choice">
                      <label v-for="option in optionsFor(field)" :key="option">
                        <input
                          v-model="fieldValues[field.key]"
                          type="checkbox"
                          :value="option"
                          :disabled="submitLocked"
                          @change="clearReceipt"
                        />
                        <span>{{ option }}</span>
                      </label>
                    </fieldset>
                  </template>

                  <textarea
                    v-else-if="field.type === 'multi_line'"
                    v-model="fieldValues[field.key]"
                    :placeholder="placeholderFor(field)"
                    :disabled="submitLocked"
                    @input="clearReceipt"
                  />

                  <input
                    v-else
                    v-model="fieldValues[field.key]"
                    :type="inputTypeFor(field)"
                    :inputmode="inputModeFor(field)"
                    :maxlength="maxLengthFor(field)"
                    :placeholder="placeholderFor(field)"
                    :disabled="submitLocked"
                    @input="clearReceipt"
                  />

                  <small v-if="field.helpText" class="input-hint">{{ field.helpText }}</small>
                  <small v-if="fieldErrors[field.key]" class="field-error">{{ fieldErrors[field.key] }}</small>
                </label>
              </template>
            </div>

            <div v-else class="upload-empty-note">
              {{ fieldPlaceholderText }}
            </div>

            <div class="upload-info-note">
              <span class="upload-note-icon" aria-hidden="true">&#10003;</span>
              <p>{{ infoNote }}</p>
            </div>
          </section>

          <section class="upload-section">
            <div class="upload-section-title">
              <span>02</span>
              <h3>上传文件</h3>
            </div>

            <div class="upload-file-rules">
              <span v-for="chip in fileRuleChips" :key="chip">{{ chip }}</span>
            </div>

            <label
              class="upload-dropzone"
              :class="{ 'is-dragover': isDragOver, 'is-disabled': submitLocked }"
              @dragover.prevent="handleDragOver"
              @dragleave="handleDragLeave"
              @drop.prevent="handleDrop"
            >
              <input
                ref="fileInputRef"
                type="file"
                :multiple="effectiveMaxFiles > 1"
                :disabled="submitLocked"
                @change="handleFileSelection"
              />
              <span class="upload-drop-icon" aria-hidden="true">+</span>
              <strong>{{ dropzoneTitle }}</strong>
              <span>{{ dropzoneDescription }}</span>
            </label>

            <div class="upload-selected-files">
              <div class="selected-files-head">
                <strong>已选文件（{{ selectedFiles.length }}）</strong>
              </div>
              <div v-if="selectedFiles.length" class="selected-files-body">
                <div v-for="(file, index) in selectedFiles" :key="`${file.name}-${file.size}-${index}`" class="selected-file">
                  <span :title="file.name">{{ file.name }}</span>
                  <strong>{{ formatFileSize(file.size) }}</strong>
                  <button class="secondary-button compact-button" type="button" :disabled="submitLocked" @click="removeFile(index)">删除</button>
                </div>
              </div>
              <div v-else class="upload-empty-note">尚未选择文件</div>
            </div>
          </section>

          <section class="upload-submit-section">
            <div class="progress-track">
              <span :style="{ width: `${uploadProgress}%` }"></span>
            </div>

            <div class="upload-submit-row">
              <p class="upload-message" :class="messageClass" role="status">{{ statusMessage || ' ' }}</p>
              <button type="submit" :disabled="submitLocked">
                <span>{{ submitButtonText }}</span>
              </button>
              <p class="upload-submit-note">{{ submitNote }}</p>
            </div>

            <section v-if="receipt" class="submit-result">
              <h2>提交成功</h2>
              <p><strong>任务：</strong>{{ receipt.assignmentTitle }}</p>
              <p><strong>时间：</strong>{{ formatDateTime(receipt.submittedAt) }}</p>
              <p><strong>文件：</strong>{{ receiptFileSummary }}</p>
              <p class="upload-submit-note submit-result-note">{{ receiptRepeatText }}</p>
            </section>
          </section>
        </form>
      </section>

      <p class="upload-footer">文件收集工具 · 安全 · 简单 · 高效</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watchEffect } from 'vue';
import type { Assignment, AssignmentField, PublicConfig, SubmissionReceipt } from './api/client';
import { getPublicAssignment, getPublicConfig, uploadSubmission } from './api/client';

type FieldValue = string | string[];

const logoUrl = `${import.meta.env.BASE_URL}assets/cloudnote-logo.jpg`;
const params = new URLSearchParams(window.location.search);
const code = params.get('code') || '';
const rawAssignmentId = params.get('id') || params.get('assignmentId') || '';
const hasTaskQuery = Boolean(code || rawAssignmentId);

const publicConfig = reactive<PublicConfig>({
  publicBaseUrl: window.location.origin,
  maxUploadSizeMb: 500,
  maxUploadFiles: 20,
  apiVersion: 'v1',
  uploadFieldName: 'files',
});

const assignment = ref<Assignment | null>(null);
const isLoading = ref(true);
const loadError = ref('');
const statusMessage = ref('');
const statusKind = ref<'success' | 'error' | ''>('');
const uploadProgress = ref(0);
const isSubmitting = ref(false);
const isDragOver = ref(false);
const selectedFiles = ref<File[]>([]);
const receipt = ref<SubmissionReceipt | null>(null);
const submittedOnce = ref(false);
const fieldValues = reactive<Record<string, FieldValue>>({});
const fieldErrors = reactive<Record<string, string>>({});
const fileInputRef = ref<HTMLInputElement | null>(null);

const activeFields = computed(() =>
  (assignment.value?.collectFields || []).filter((field) => field.enabled !== false && field.visible !== false)
);

const isHomeState = computed(() => !hasTaskQuery);
const isInvalidState = computed(() => Boolean(loadError.value));
const assignmentStatus = computed(() => assignment.value?.effectiveStatus || 'home');

const statusTone = computed(() => {
  if (isLoading.value) return 'home';
  if (isInvalidState.value) return 'deleted';
  if (isHomeState.value) return 'home';
  return assignmentStatus.value;
});

const statusBadge = computed(() => {
  if (isLoading.value) return '加载中';
  if (isInvalidState.value) return '无效链接';
  if (isHomeState.value) return '首页入口';

  return (
    {
      ongoing: '进行中',
      expired: '已截止',
      ended: '已结束',
      archived: '已归档',
      deleted: '已删除',
    }[assignmentStatus.value] || '任务状态'
  );
});

const taskTitle = computed(() => {
  if (isLoading.value) return '正在加载任务信息';
  if (isInvalidState.value) return loadError.value || '任务不存在或链接无效';
  if (isHomeState.value) return '默认作业收集入口';
  return assignment.value?.title || '未命名任务';
});

const taskMeta = computed(() => {
  if (isHomeState.value || isInvalidState.value || !assignment.value) return '';
  return assignment.value.deadline ? `截止：${formatDateTime(assignment.value.deadline)}` : '未设置截止时间';
});

const introText = computed(() => {
  if (isLoading.value) return '正在连接平台并读取任务配置，请稍候。';
  if (isInvalidState.value) return '请确认班长分享的任务链接是否完整。';
  if (isHomeState.value) return '请使用班长分享的独立任务链接进入具体收集页；如果首页链接携带任务参数，也会自动加载对应任务。';
  return assignment.value?.description || '请按要求填写信息并上传文件。';
});

const statusHint = computed(() => {
  if (isLoading.value) return '正在读取任务状态。';
  if (isInvalidState.value) return loadError.value || '任务不存在或链接无效';
  if (isHomeState.value) return '当前是首页默认入口，请通过具体任务链接提交作业。';

  switch (assignmentStatus.value) {
    case 'expired':
      return assignment.value?.allowLate ? '已逾期，但允许继续提交' : '已超过截止时间，不能继续提交';
    case 'ended':
      return '该任务已结束，不能继续提交';
    case 'archived':
      return '该任务已归档，不能继续提交';
    case 'deleted':
      return '任务不存在或已删除';
    default:
      return '任务正在收集中，请确认信息和文件后提交。';
  }
});

const infoNote = computed(() => {
  if (isHomeState.value) return '首页仅作为统一入口，打开具体任务链接后会加载对应字段和上传限制。';
  if (!assignment.value) return '当前任务不可用，无法填写上传信息。';
  if (!assignment.value.allowRepeat) return '该任务不允许重复提交，提交成功后会自动锁定本次页面。';
  if (assignment.value.repeatMode === 'overwrite') return '该任务允许重复提交，新的提交会覆盖同身份信息的旧记录。';
  return '该任务允许重复提交，新的提交会作为新的记录保留。';
});

const effectiveMaxFiles = computed(() => {
  if (!assignment.value) return publicConfig.maxUploadFiles;
  return assignment.value.fileRules.enableLimit
    ? Math.min(assignment.value.fileRules.maxFileCount, publicConfig.maxUploadFiles)
    : publicConfig.maxUploadFiles;
});

const effectiveMaxFileSizeMb = computed(() => {
  if (!assignment.value) return publicConfig.maxUploadSizeMb;
  return assignment.value.fileRules.enableLimit
    ? Math.min(assignment.value.fileRules.maxFileSizeMB, publicConfig.maxUploadSizeMb)
    : publicConfig.maxUploadSizeMb;
});

const fieldPlaceholderText = computed(() => {
  if (isHomeState.value) return '请先打开班长分享的任务链接，再填写本次任务所需的信息。';
  if (isInvalidState.value) return '当前任务不可用，无法填写上传信息。';
  return '本任务无需填写额外信息。';
});

const fileRuleChips = computed(() => {
  if (isHomeState.value) {
    return ['当前未指定任务', '请通过独立任务链接进入上传', '首页支持带参数直接加载任务'];
  }

  if (!assignment.value) {
    return ['当前无法上传', '请检查任务链接'];
  }

  const extensions = assignment.value.fileRules.allowedExtensions || [];
  const limitText = assignment.value.fileRules.enableLimit
    ? [`最多 ${effectiveMaxFiles.value} 个文件`, `单文件 ${effectiveMaxFileSizeMb.value} MB`]
    : [`系统最多 ${effectiveMaxFiles.value} 个文件`, `系统单文件上限 ${effectiveMaxFileSizeMb.value} MB`];

  return [
    assignment.value.fileRules.requiredUpload === false ? '文件可选' : '必须上传文件',
    ...limitText,
    `格式：${extensions.length ? extensions.join(', ') : '不限'}`,
  ];
});

const dropzoneTitle = computed(() => {
  if (submitLocked.value) return '当前状态不可上传文件';
  return '拖拽文件到这里，或点击选择文件';
});

const dropzoneDescription = computed(() => {
  if (isHomeState.value) return '请先通过具体任务链接进入上传页。';
  return '拖拽会追加文件，重新选择文件会替换当前已选内容。';
});

const submitBlockedReason = computed(() => {
  if (isLoading.value) return '任务加载中';
  if (isInvalidState.value) return loadError.value || '当前任务不可提交';
  if (isHomeState.value) return '请先打开具体任务链接';
  if (!assignment.value) return '任务未加载完成';
  if (submittedOnce.value && assignment.value.allowRepeat === false) return '该任务不允许重复提交';

  switch (assignmentStatus.value) {
    case 'expired':
      return assignment.value.allowLate ? '' : '已超过截止时间，不能继续提交';
    case 'ended':
      return '该任务已结束，不能继续提交。';
    case 'archived':
      return '该任务已归档，不能继续提交。';
    case 'deleted':
      return '任务不存在或已删除。';
    default:
      return '';
  }
});

const submitLocked = computed(() => isSubmitting.value || Boolean(submitBlockedReason.value));

const submitButtonText = computed(() => {
  if (isSubmitting.value) return '正在提交...';
  if (submittedOnce.value && assignment.value?.allowRepeat === false) return '已提交';
  return '提交作业';
});

const submitNote = computed(() => {
  if (submitBlockedReason.value) return submitBlockedReason.value;
  if (assignmentStatus.value === 'expired' && assignment.value?.allowLate) return '已逾期，但允许继续提交';
  if (!assignment.value) return '等待任务加载完成。';
  return assignment.value.fileRules.enableRename ? '提交后文件会按任务命名规则自动重命名。' : '提交后保留原始文件名。';
});

const receiptFileSummary = computed(() => {
  if (!receipt.value?.files?.length) return '未上传文件';
  return receipt.value.files.map((file) => file.originalFilename).join(' / ');
});

const receiptRepeatText = computed(() => {
  if (assignment.value?.allowRepeat === false) return '已提交，不能重复提交';
  return '可以继续提交';
});

const messageClass = computed(() => ({
  success: statusKind.value === 'success',
  error: statusKind.value === 'error',
  placeholder: !statusMessage.value,
}));

function setMessage(text = '', kind: 'success' | 'error' | '' = ''): void {
  statusMessage.value = text;
  statusKind.value = kind;
}

function clearReceipt(): void {
  if (receipt.value) receipt.value = null;
}

function splitOptions(options: string[] | undefined): string[] {
  return Array.isArray(options) ? options.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function optionsFor(field: AssignmentField): string[] {
  const options = splitOptions(field.rules?.options);
  if (options.length) return options;
  return field.type === 'multiple_choice' ? ['选项一', '选项二', '选项三'] : ['选项一', '选项二'];
}

function placeholderFor(field: AssignmentField): string {
  if (field.placeholder) return field.placeholder;
  if (field.type === 'phone') return '请输入手机号';
  if (field.type === 'email') return '请输入邮箱';
  if (field.type === 'idcard') return '请输入身份证号';
  return `请输入${field.label}`;
}

function inputTypeFor(field: AssignmentField): string {
  if (field.type === 'email') return 'email';
  if (field.type === 'birth_date') return 'date';
  if (field.type === 'datetime') return 'datetime-local';
  return 'text';
}

function inputModeFor(field: AssignmentField): string | undefined {
  if (field.type === 'phone' || field.type === 'digits' || field.type === 'positive_integer') return 'numeric';
  if (field.type === 'numeric') return 'decimal';
  return undefined;
}

function maxLengthFor(field: AssignmentField): number | undefined {
  if (field.type === 'phone') return 11;
  if (field.type === 'idcard') return 18;
  if (field.type === 'single_line') return 50;
  if (field.type === 'multi_line') return 1000;
  if (field.type === 'digits' && field.rules?.length) return Number(field.rules.length);
  return undefined;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function parseStrictDateParts(value: string): Date | null {
  const match = String(value || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function isValidBirthDate(value: string): boolean {
  const date = parseStrictDateParts(value);
  if (!date) return false;
  const min = new Date(1900, 0, 1);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date >= min && date <= today;
}

function isValidDateTime(value: string): boolean {
  const match = String(value || '')
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match || !parseStrictDateParts(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidIdCard(value: string): boolean {
  const text = String(value || '').trim();
  if (/^\d{15}$/.test(text)) {
    return Boolean(parseStrictDateParts(`19${text.slice(6, 8)}-${text.slice(8, 10)}-${text.slice(10, 12)}`));
  }
  if (!/^\d{17}[\dXx]$/.test(text)) return false;
  if (!parseStrictDateParts(`${text.slice(6, 10)}-${text.slice(10, 12)}-${text.slice(12, 14)}`)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = text
    .slice(0, 17)
    .split('')
    .reduce((total, char, index) => total + Number(char) * weights[index], 0);
  return codes[sum % 11] === text[17].toUpperCase();
}

function resetFieldState(): void {
  Object.keys(fieldErrors).forEach((key) => delete fieldErrors[key]);
  Object.keys(fieldValues).forEach((key) => delete fieldValues[key]);

  activeFields.value.forEach((field) => {
    fieldValues[field.key] = field.type === 'multiple_choice' ? [] : '';
  });
}

function normalizeFieldValue(field: AssignmentField): string | string[] {
  const raw = fieldValues[field.key];
  if (field.type === 'multiple_choice') {
    return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
  }
  return String(raw || '').trim();
}

function validateField(field: AssignmentField, value: string | string[]): string {
  const label = field.label;
  const textValue = Array.isArray(value) ? value.join(', ') : value;

  if (field.required) {
    if (Array.isArray(value) && !value.length) return `${label}不能为空`;
    if (!Array.isArray(value) && !textValue) return `${label}不能为空`;
  }

  if (!textValue) return '';

  if (field.type === 'name' && !(/^[\u4e00-\u9fa5]{1,5}$/.test(textValue) || (/^[A-Za-z\s]{1,20}$/.test(textValue) && /[A-Za-z]/.test(textValue)))) {
    return `${label}格式不正确`;
  }
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(textValue)) return `${label}格式不正确`;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue)) return `${label}格式不正确`;
  if (field.type === 'idcard' && !isValidIdCard(textValue)) return `${label}格式不正确`;
  if (field.type === 'birth_date' && !isValidBirthDate(textValue)) return `${label}必须是 1900-01-01 到今天之间的真实日期`;
  if (field.type === 'single_line' && textValue.length > 50) return `${label}长度不能超过 50 个字符`;
  if (field.type === 'multi_line' && textValue.length > 1000) return `${label}长度不能超过 1000 个字符`;

  if (field.type === 'digits') {
    if (!/^\d+$/.test(textValue)) return `${label}只能填写数字`;
    if (field.rules?.length && !new RegExp(`^\\d{${Number(field.rules.length)}}$`).test(textValue)) {
      return `${label}需要填写 ${field.rules.length} 位数字`;
    }
  }

  if (field.type === 'numeric') {
    if (!/^-?\d+(\.\d+)?$/.test(textValue)) return `${label}必须是合法数字`;
    if (field.rules?.min !== undefined && Number(textValue) < Number(field.rules.min)) return `${label}不能小于${field.rules.min}`;
    if (field.rules?.max !== undefined && Number(textValue) > Number(field.rules.max)) return `${label}不能大于${field.rules.max}`;
  }

  if (field.type === 'positive_integer' && !/^[1-9]\d*$/.test(textValue)) return `${label}必须是大于 0 的整数`;
  if (field.type === 'datetime' && !isValidDateTime(textValue)) return `${label}日期时间格式不正确`;

  if (field.type === 'single_choice') {
    const options = optionsFor(field);
    if (options.length && !options.includes(textValue)) return `${label}选项不正确`;
  }

  if (field.type === 'multiple_choice') {
    const values = Array.isArray(value) ? value : [];
    if (new Set(values).size !== values.length) return `${label}不能重复选择`;
    const options = optionsFor(field);
    if (options.length && values.some((item) => !options.includes(item))) return `${label}选项不正确`;
  }

  return '';
}

function validateSelectedFiles(files: File[]): string {
  if (!assignment.value) return '请使用有效的任务链接';
  if (!files.length) return assignment.value.fileRules.requiredUpload ? '请选择文件' : '';
  if (files.length > effectiveMaxFiles.value) {
    return assignment.value.fileRules.enableLimit
      ? `文件数量超过限制，最多只能上传 ${effectiveMaxFiles.value} 个文件`
      : `文件数量超过系统限制，最多只能上传 ${effectiveMaxFiles.value} 个文件`;
  }

  const allowedExtensions = new Set(
    (assignment.value.fileRules.allowedExtensions || []).map((item) => item.replace(/^\./, '').toLowerCase()).filter(Boolean)
  );

  for (const file of files) {
    const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
    if (allowedExtensions.size && !allowedExtensions.has(extension)) return `不允许的文件格式：${file.name}`;
    if (file.size > effectiveMaxFileSizeMb.value * 1024 * 1024) {
      return assignment.value.fileRules.enableLimit
        ? `文件超过大小限制：${file.name}，单文件最大 ${effectiveMaxFileSizeMb.value} MB`
        : `文件超过系统大小限制：${file.name}，单文件最大 ${effectiveMaxFileSizeMb.value} MB`;
    }
  }

  return '';
}

function validateForm(): boolean {
  Object.keys(fieldErrors).forEach((key) => delete fieldErrors[key]);

  let hasError = false;
  activeFields.value.forEach((field) => {
    const message = validateField(field, normalizeFieldValue(field));
    if (message) {
      hasError = true;
      fieldErrors[field.key] = message;
    }
  });

  const fileError = validateSelectedFiles(selectedFiles.value);
  if (fileError) {
    hasError = true;
    setMessage(fileError, 'error');
  }

  return !hasError;
}

function clearTransientState(): void {
  uploadProgress.value = 0;
  selectedFiles.value = [];
  if (fileInputRef.value) fileInputRef.value.value = '';
  resetFieldState();
}

function handleFileSelection(event: Event): void {
  const input = event.target as HTMLInputElement;
  const incoming = [...(input.files || [])];
  if (!incoming.length) return;

  clearReceipt();
  selectedFiles.value = incoming;
  const error = validateSelectedFiles(selectedFiles.value);
  setMessage(error, error ? 'error' : '');
  input.value = '';
}

function handleDragOver(): void {
  if (submitLocked.value) return;
  isDragOver.value = true;
}

function handleDragLeave(): void {
  isDragOver.value = false;
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  if (submitLocked.value) return;

  const incoming = [...(event.dataTransfer?.files || [])];
  if (!incoming.length) return;

  clearReceipt();
  selectedFiles.value = [...selectedFiles.value, ...incoming];
  const error = validateSelectedFiles(selectedFiles.value);
  setMessage(error, error ? 'error' : '');
}

function removeFile(index: number): void {
  clearReceipt();
  selectedFiles.value.splice(index, 1);
  const error = validateSelectedFiles(selectedFiles.value);
  setMessage(error, error ? 'error' : '');
}

function applyInitialStatusMessage(): void {
  if (isHomeState.value) {
    setMessage('当前是首页默认入口，请使用具体任务链接提交作业。', '');
    return;
  }

  if (!assignment.value) {
    setMessage('', '');
    return;
  }

  if (assignment.value.effectiveStatus !== 'ongoing' && !(assignment.value.effectiveStatus === 'expired' && assignment.value.allowLate)) {
    setMessage(submitBlockedReason.value, 'error');
    return;
  }

  if (assignment.value.effectiveStatus === 'expired' && assignment.value.allowLate) {
    setMessage('已逾期，但允许继续提交', 'success');
    return;
  }

  setMessage('', '');
}

async function loadPageData(): Promise<void> {
  isLoading.value = true;
  loadError.value = '';
  setMessage('', '');

  try {
    const config = await getPublicConfig();
    Object.assign(publicConfig, config);
  } catch {
    Object.assign(publicConfig, {
      publicBaseUrl: window.location.origin,
      maxUploadSizeMb: 500,
      maxUploadFiles: 20,
      apiVersion: 'v1',
      uploadFieldName: 'files',
    });
  }

  if (!hasTaskQuery) {
    assignment.value = null;
    receipt.value = null;
    submittedOnce.value = false;
    clearTransientState();
    isLoading.value = false;
    applyInitialStatusMessage();
    return;
  }

  try {
    const query = code ? `code=${encodeURIComponent(code)}` : `id=${encodeURIComponent(rawAssignmentId)}`;
    assignment.value = await getPublicAssignment(query);
    submittedOnce.value = false;
    receipt.value = null;
    clearTransientState();
    applyInitialStatusMessage();
  } catch (error) {
    assignment.value = null;
    receipt.value = null;
    submittedOnce.value = false;
    clearTransientState();
    loadError.value = error instanceof Error ? error.message : '任务加载失败，请稍后重试';
    setMessage(loadError.value, 'error');
  } finally {
    isLoading.value = false;
  }
}

async function handleSubmit(): Promise<void> {
  if (submitLocked.value || !assignment.value) return;
  clearReceipt();
  setMessage('', '');

  if (!validateForm()) return;

  const formData = new FormData();
  formData.append('assignmentId', String(assignment.value.id));

  activeFields.value.forEach((field) => {
    const value = normalizeFieldValue(field);
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(field.key, item));
      return;
    }
    formData.append(field.key, value);
  });

  selectedFiles.value.forEach((file) => formData.append(publicConfig.uploadFieldName || 'files', file));

  isSubmitting.value = true;
  uploadProgress.value = 0;
  setMessage('正在上传...', '');

  try {
    receipt.value = await uploadSubmission(formData, (percent) => {
      uploadProgress.value = percent;
    });
    submittedOnce.value = true;
    clearTransientState();
    if (assignment.value.allowRepeat === false) {
      setMessage('提交成功。该任务不允许重复提交，请勿再次提交。', 'success');
    } else {
      setMessage('提交成功', 'success');
    }
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '上传失败，请稍后重试', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

watchEffect(() => {
  document.body.classList.toggle('upload-invalid-state', isInvalidState.value);
});

onMounted(() => {
  void loadPageData();
});

onUnmounted(() => {
  document.body.classList.remove('upload-invalid-state');
});
</script>
