<template>
  <section class="panel admin-panel admin-section" data-section-panel="create">
    <div class="create-shell">
      <div class="create-left-panel">
        <div class="create-page-head">
          <div>
            <p class="eyebrow">CREATE ASSIGNMENT</p>
            <h1>{{ isEditing ? '编辑任务' : '创建任务' }}</h1>
            <p class="intro">创建独立作业收集任务，生成对应提交链接。</p>
          </div>
          <div class="create-head-actions">
            <button class="secondary-button compact-button template-quick-button" type="button" @click="openTemplateModal('picker')">套用模板</button>
          </div>
        </div>

        <form class="assignment-form create-task-form" @submit.prevent="handleSubmit">
          <input type="hidden" v-model="form.status" />
          <input type="hidden" :value="renameFieldValue" />

          <nav class="task-tabs create-task-tabs" role="tablist" aria-label="创建任务步骤">
            <button
              class="task-tab"
              :class="{
                'is-active': activeTab === 'basic',
                'has-error': hasSubmittedCreateForm && tabErrorCounts.basic > 0,
                'is-complete': tabCompleteState.basic && tabErrorCounts.basic === 0,
              }"
              :data-error-count="hasSubmittedCreateForm && tabErrorCounts.basic > 0 ? String(tabErrorCounts.basic) : ''"
              type="button"
              @click="activeTab = 'basic'"
            >
              <span class="task-tab-index">1</span>
              <span><strong>基础信息</strong><small>填写任务基本信息</small></span>
            </button>
            <button
              class="task-tab"
              :class="{
                'is-active': activeTab === 'collect',
                'has-error': hasSubmittedCreateForm && tabErrorCounts.collect > 0,
                'is-complete': tabCompleteState.collect && tabErrorCounts.collect === 0,
              }"
              :data-error-count="hasSubmittedCreateForm && tabErrorCounts.collect > 0 ? String(tabErrorCounts.collect) : ''"
              type="button"
              @click="activeTab = 'collect'"
            >
              <span class="task-tab-index">2</span>
              <span><strong>收集信息</strong><small>配置收集字段内容</small></span>
            </button>
            <button
              class="task-tab"
              :class="{
                'is-active': activeTab === 'files',
                'has-error': hasSubmittedCreateForm && tabErrorCounts.files > 0,
                'is-complete': tabCompleteState.files && tabErrorCounts.files === 0,
              }"
              :data-error-count="hasSubmittedCreateForm && tabErrorCounts.files > 0 ? String(tabErrorCounts.files) : ''"
              type="button"
              @click="activeTab = 'files'"
            >
              <span class="task-tab-index">3</span>
              <span><strong>文件设置</strong><small>设置文件上传要求</small></span>
            </button>
          </nav>

          <div class="create-workspace">
            <div class="create-main-stack">
              <article v-show="activeTab === 'basic'" class="create-step-card">
                <div class="step-title-row">
                  <span class="step-number">1</span>
                  <div>
                    <h2>基础信息</h2>
                    <p>填写任务标题、时间与提交规则。</p>
                  </div>
                </div>

                <div class="basic-form-grid">
                  <label>
                    <span>任务标题 <b>*</b></span>
                    <input v-model="form.title" data-focus-id="title" required placeholder="例如：英语第三周阅读作业" @input="markDraftDirty()" />
                  </label>

                  <label class="wide-field">
                    <span>任务说明</span>
                    <textarea v-model="form.description" maxlength="300" placeholder="请按要求完成阅读理解并提交答案，格式见附件说明。" @input="markDraftDirty()" />
                    <small class="input-hint">{{ form.description.length }} / 300</small>
                  </label>

                  <label class="deadline-field" :class="{ 'is-muted': noDeadline }">
                    <span>截止时间 <b>*</b></span>
                    <input type="datetime-local" data-focus-id="deadline" v-model="deadlineLocal" :disabled="noDeadline" @change="markDraftDirty()" />
                  </label>

                  <label class="switch-field inline-switch no-deadline-switch">
                    <span>永不截止</span>
                    <input type="checkbox" v-model="noDeadline" @change="handleNoDeadlineToggle" />
                    <i></i>
                  </label>

                  <label class="switch-field inline-switch">
                    <span>允许重复提交</span>
                    <input type="checkbox" v-model="form.allowRepeat" @change="markDraftDirty()" />
                    <i></i>
                  </label>

                  <label class="switch-field inline-switch">
                    <span>允许逾期提交</span>
                    <input type="checkbox" v-model="form.allowLate" @change="markDraftDirty()" />
                    <i></i>
                  </label>

                  <label>
                    <span>重复策略</span>
                    <select v-model="form.repeatMode" @change="markDraftDirty()">
                      <option value="new">作为新文件</option>
                      <option value="overwrite">覆盖上次提交</option>
                    </select>
                  </label>

                  <label>
                    <span>打包形式</span>
                    <select v-model="form.downloadStructure" @change="markDraftDirty()">
                      <option value="task-field-file">任务/提交者/文件</option>
                      <option value="task-file">任务/文件</option>
                    </select>
                  </label>
                </div>
              </article>

              <article v-show="activeTab === 'collect'" class="create-step-card collect-fields-tab">
                <div class="step-title-row">
                  <div>
                    <span class="step-number">2</span>
                    <div>
                      <h2>收集信息</h2>
                      <p>设置提交页面需要填写的信息，可为空不配置。</p>
                    </div>
                  </div>
                </div>

                <div class="collect-action-row">
                  <div class="field-type-picker">
                    <button class="secondary-button compact-button" data-focus-id="add-field" type="button" @click="openFieldTypeModal">+ 添加信息类型</button>
                    <div v-if="fieldTypeModalOpen" class="type-popover field-type-modal" role="dialog" aria-modal="true" aria-labelledby="fieldTypePickerTitle">
                      <div class="type-popover-backdrop" @click="closeFieldTypeModal"></div>
                      <section class="type-popover-panel">
                        <header class="type-popover-head">
                          <div>
                            <p class="eyebrow">FIELD TYPES</p>
                            <h3 id="fieldTypePickerTitle">添加信息类型</h3>
                          </div>
                          <button class="icon-button" type="button" aria-label="close field type picker" @click="closeFieldTypeModal">×</button>
                        </header>
                        <div class="type-group-title">基础类型</div>
                        <div class="type-grid">
                          <button v-for="type in BASIC_FIELD_TYPES" :key="type" type="button" @click="handleFieldTypePick(type)">
                            {{ fieldTypeLabel(type) }}
                          </button>
                        </div>
                        <div class="type-group-title">自定义类型</div>
                        <div class="type-grid">
                          <button v-for="type in CUSTOM_FIELD_TYPES" :key="type" type="button" @click="handleFieldTypePick(type)">
                            {{ fieldTypeLabel(type) }}
                          </button>
                        </div>
                      </section>
                    </div>
                  </div>
                  <button class="secondary-button compact-button field-bulk-delete-button" :disabled="!selectedFieldKeys.length" type="button" @click="deleteSelectedFields">删除选中</button>
                </div>

                <div class="collect-field-table">
                  <div class="field-table-head">
                    <span>序号</span>
                    <span>信息名称</span>
                    <span>信息类型</span>
                    <span>是否必填</span>
                    <span>规则</span>
                    <span>排序</span>
                    <span>删除</span>
                    <span class="field-select-head">选择</span>
                  </div>

                  <div class="field-config-list collect-field-list">
                    <div v-if="!form.collectFields.length" class="empty-card collect-empty-state">暂无收集信息，点击上方按钮添加信息类型。</div>

                    <div v-for="(field, index) in form.collectFields" :key="field.key" class="collect-field-row" :data-field-key="field.key">
                      <span class="field-index">{{ index + 1 }}</span>

                      <div class="field-name-editor" :class="{ 'is-field-error': Boolean(fieldNameErrors[field.key]) }">
                        <div class="field-name-control" :class="{ 'has-confirm': !isBasicField(field.type) }">
                          <input
                            class="field-name-input"
                            :value="fieldDraftLabels[field.key] ?? field.label"
                            data-field-role="label"
                            placeholder="字段名称"
                            :readonly="isBasicField(field.type)"
                            @input="handleFieldLabelInput(field, $event)"
                            @keydown.enter.prevent="confirmFieldLabel(field, true)"
                            @keydown.escape.prevent="restoreFieldLabel(field)"
                          />
                          <button
                            v-if="!isBasicField(field.type)"
                            class="field-name-confirm"
                            type="button"
                            title="确认信息名称"
                            aria-label="confirm field name"
                            @click="confirmFieldLabel(field, true)"
                          >
                            ✓
                          </button>
                        </div>
                        <small v-if="fieldNameErrors[field.key]" class="field-error-message">{{ fieldNameErrors[field.key] }}</small>
                      </div>

                      <select v-model="field.type" data-field-role="type" :disabled="isBasicField(field.type)" @change="handleFieldTypeChange(field)">
                        <option v-if="isBasicField(field.type)" :value="field.type">{{ fieldTypeLabel(field.type) }}</option>
                        <option v-for="type in CUSTOM_FIELD_TYPES" v-else :key="type" :value="type">{{ fieldTypeLabel(type) }}</option>
                      </select>

                      <label class="check-inline">
                        <input type="checkbox" v-model="field.required" @change="markDraftDirty()" />
                        必填
                      </label>

                      <div class="field-rule-cell">
                        <template v-if="field.type === 'digits'">
                          <div class="compact-rule">
                            <input v-model="field.rules.length" data-field-role="digits" type="number" min="1" max="30" placeholder="位数，如 8" @input="markDraftDirty()" />
                          </div>
                        </template>
                        <template v-else-if="field.type === 'numeric'">
                          <div class="compact-range-rule">
                            <input v-model="field.rules.min" data-field-role="min" type="number" step="any" placeholder="最小值" @input="markDraftDirty()" />
                            <input v-model="field.rules.max" data-field-role="max" type="number" step="any" placeholder="最大值" @input="markDraftDirty()" />
                          </div>
                        </template>
                        <template v-else-if="field.type === 'single_choice' || field.type === 'multiple_choice'">
                          <div class="compact-options">
                            <input v-model="field.optionText" data-field-role="options" type="text" placeholder="选项一, 选项二" @input="markDraftDirty()" />
                          </div>
                        </template>
                        <span v-else class="field-rule-text">{{ ruleTextFor(field.type) }}</span>
                      </div>

                      <div class="field-order-actions">
                        <button class="icon-button" type="button" aria-label="move up" @click="moveField(index, -1)">↑</button>
                        <button class="icon-button" type="button" aria-label="move down" @click="moveField(index, 1)">↓</button>
                      </div>

                      <button class="icon-button delete-icon" type="button" aria-label="delete field" @click="confirmRemoveField(index)">×</button>

                      <label class="field-select-cell">
                        <input type="checkbox" v-model="selectedFieldKeys" :value="field.key" />
                        选择
                      </label>
                    </div>
                  </div>
                </div>

                <div class="collect-type-note">
                  <strong>信息类型说明</strong>
                  <span>基础类型：姓名、手机号、身份证号、邮箱、出生日期；自定义类型：单行文本、纯数值、纯数字、单选、多选、多行文本、日期和时间、正整数。</span>
                </div>
              </article>

              <article v-show="activeTab === 'files'" class="create-step-card file-settings-tab">
                <div class="step-title-row">
                  <span class="step-number">3</span>
                  <div>
                    <h2>文件设置</h2>
                    <p>配置文件类型、上传限制与重命名规则。</p>
                  </div>
                </div>

                <div class="file-settings-grid">
                  <section class="file-settings-group">
                    <h3>文件类型与上传限制</h3>

                    <label class="switch-field inline-switch">
                      <span>必须上传文件</span>
                      <input type="checkbox" v-model="form.fileRules.requiredUpload" @change="markDraftDirty()" />
                      <i></i>
                    </label>

                    <div class="file-type-checks">
                      <span>文件类型</span>
                      <label v-for="ext in extensions" :key="ext.value">
                        <input type="checkbox" :value="ext.value" v-model="form.fileRules.allowedExtensions" @change="handleExtensionChange" />
                        {{ ext.label }} <small>{{ ext.small }}</small>
                      </label>
                    </div>

                    <label class="switch-field inline-switch">
                      <span>限制文件大小 / 数量</span>
                      <input type="checkbox" v-model="form.fileRules.enableLimit" @change="markDraftDirty()" />
                      <i></i>
                    </label>

                    <div class="limit-row" :class="{ 'is-muted': !form.fileRules.enableLimit }">
                      <label>
                        <span>单文件 MB</span>
                        <input type="number" data-focus-id="max-file-size" v-model.number="form.fileRules.maxFileSizeMB" min="1" :max="systemConfig.maxUploadSizeMb" :disabled="!form.fileRules.enableLimit" @input="markDraftDirty()" />
                      </label>
                      <label>
                        <span>文件数量</span>
                        <input type="number" data-focus-id="max-file-count" v-model.number="form.fileRules.maxFileCount" min="1" :max="systemConfig.maxUploadFiles" :disabled="!form.fileRules.enableLimit" @input="markDraftDirty()" />
                      </label>
                    </div>
                  </section>

                  <section class="file-settings-group">
                    <h3>重命名规则</h3>

                    <label class="switch-field inline-switch">
                      <span>重命名文件</span>
                      <input type="checkbox" v-model="form.fileRules.enableRename" @change="handleRenameEnabledChange" />
                      <i></i>
                    </label>

                    <div class="rename-rule-box" :class="{ 'is-muted': !form.fileRules.enableRename }">
                      <span>重命名规则预览：<strong>{{ renamePreview }}</strong></span>
                      <button class="secondary-button compact-button" type="button" :disabled="!form.fileRules.enableRename" @click.stop="toggleRenamePopover">选择规则</button>
                      <div v-if="renameRuleOpen" class="rename-popover" @click.stop>
                        <div class="rename-options">
                          <button
                            v-for="option in renameOptions"
                            :key="option.key"
                            class="rename-option"
                            :class="{ 'is-selected': renameFields.includes(option.key) }"
                            type="button"
                            @click="toggleRenameField(option.key)"
                          >
                            <span>{{ renameFields.includes(option.key) ? '✓' : '' }}</span>{{ option.label }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </article>
            </div>
          </div>

          <div class="create-action-bar">
            <div class="autosave-status">
              <span class="autosave-dot">✓</span>
              <div>
                <strong>自动保存</strong>
                <small>{{ draftStatusText }}</small>
              </div>
            </div>
            <div class="create-action-buttons">
              <button class="secondary-button" type="button" @click="$router.push('/assignments')">任务列表</button>
              <button class="secondary-button template-save-button" type="button" @click="handleSaveTemplateEntry">
                {{ saveTemplateButtonText }}
              </button>
              <button id="assignmentSubmitButton" type="submit">{{ isEditing ? '保存修改' : '发布任务' }}</button>
            </div>
          </div>
        </form>

        <p v-if="message" class="message" :class="{ 'is-success': success, 'is-error': !success }" role="status">{{ message }}</p>
      </div>
    </div>

    <div v-if="showSaveTemplateModal" class="template-modal">
      <div class="template-modal-backdrop" @click="showSaveTemplateModal = false"></div>
      <section class="template-modal-panel template-save-panel">
        <div class="template-modal-head">
          <div>
            <p class="eyebrow">SAVE TEMPLATE</p>
            <h2>{{ editingTemplateId ? '覆盖模板设置' : '保存模板设置' }}</h2>
          </div>
          <button class="icon-button" type="button" aria-label="close save template modal" @click="showSaveTemplateModal = false">×</button>
        </div>

        <form class="template-edit-form" @submit.prevent="saveTemplate">
          <label>
            <span>模板名称</span>
            <input v-model="templateForm.name" placeholder="例如：英语作业通用模板" />
          </label>
          <label>
            <span>模板分类</span>
            <select v-model="templateForm.category">
              <option value="course">课程作业</option>
              <option value="exam">测试收集</option>
              <option value="material">材料归集</option>
            </select>
          </label>
          <div class="radio-row">
            <label class="check-inline"><input v-model="templateForm.visibility" type="radio" value="private" /> 仅自己可见</label>
            <label class="check-inline"><input v-model="templateForm.visibility" type="radio" value="class" /> 班级共享</label>
          </div>
          <div class="template-edit-actions">
            <button class="secondary-button" type="button" @click="showSaveTemplateModal = false">取消</button>
            <button type="submit">确认保存</button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="templateModalOpen" class="template-modal">
      <div class="template-modal-backdrop" @click="closeTemplateModal"></div>
      <section class="template-modal-panel">
        <div class="template-modal-head">
          <div>
            <p class="eyebrow">TASK TEMPLATES</p>
            <h2>{{ templateModalMode === 'picker' ? '套用模板' : '模板管理' }}</h2>
          </div>
          <button class="icon-button" type="button" aria-label="close template modal" @click="closeTemplateModal">×</button>
        </div>

        <div class="template-modal-tools">
          <input v-model="templateSearch" type="search" placeholder="搜索模板名称" />
          <select v-model="templateCategoryFilter">
            <option value="">全部分类</option>
            <option value="course">课程作业</option>
            <option value="exam">测试收集</option>
            <option value="material">材料归集</option>
          </select>
        </div>

        <div class="template-bulk-bar">
          <label class="template-select-all"><input type="checkbox" :checked="allTemplateSelected" @change="toggleAllTemplates(($event.target as HTMLInputElement).checked)" /> 全选</label>
          <span>已选择 {{ selectedTemplateIds.length }} 项</span>
          <button class="danger-outline-button compact-button" type="button" :disabled="!selectedTemplateIds.length" @click="deleteSelectedTemplates">批量删除</button>
        </div>

        <div class="template-manager-list">
          <div v-if="!filteredTemplates.length" class="empty-card template-empty">暂无模板，可先填写任务配置后点击“保存模板”。</div>

          <article v-for="template in filteredTemplates" :key="template.id" class="template-list-item">
            <label class="template-item-check" aria-label="选择模板">
              <input type="checkbox" :checked="selectedTemplateIds.includes(template.id)" @change="toggleTemplateSelection(template.id, ($event.target as HTMLInputElement).checked)" />
            </label>
            <div>
              <h3>{{ template.name }}</h3>
              <p>{{ categoryLabel(template.category) }} · {{ visibilityLabel(template.visibility) }}</p>
              <p>创建：{{ formatDateTime(template.createdAt) }} · 更新：{{ formatDateTime(template.updatedAt) }}</p>
              <p class="template-preview-title">任务预览</p>
              <div class="template-preview-chips">
                <span>{{ templateFieldCount(template) }} 个字段</span>
                <span>{{ templateRequiredFieldCount(template) }} 个必填</span>
                <span>{{ fileTypeLabel(template.data.fileType || 'document') }}</span>
                <span>{{ templateFileLimitText(template.data) }}</span>
                <span>重命名：{{ template.data.renameEnabled === false ? '否' : '是' }}</span>
                <span>{{ downloadStructureLabel(template.data.downloadStructure) }}</span>
              </div>
            </div>
            <div class="template-list-actions">
              <button class="compact-button" type="button" @click="applyTemplate(template)">套用</button>
              <button class="secondary-button compact-button" type="button" @click="previewTemplate(template)">预览</button>
              <button class="secondary-button compact-button" type="button" @click="editTemplate(template)">编辑</button>
              <button class="danger-outline-button compact-button" type="button" @click="deleteTemplate(template)">删除</button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div v-if="previewingTemplate" class="template-modal">
      <div class="template-modal-backdrop" @click="previewingTemplate = null"></div>
      <section class="template-modal-panel template-preview-panel">
        <div class="template-modal-head">
          <div>
            <p class="eyebrow">TASK PREVIEW</p>
            <h2>{{ previewingTemplate.name }}</h2>
          </div>
          <button class="icon-button" type="button" aria-label="close template preview" @click="previewingTemplate = null">×</button>
        </div>

        <div class="template-preview-content">
          <section>
            <h3>基础信息摘要</h3>
            <dl class="template-preview-dl">
              <div><dt>任务标题</dt><dd>{{ previewingTemplate.data.title || '-' }}</dd></div>
              <div><dt>任务状态</dt><dd>{{ statusLabel(previewingTemplate.data.status || 'ongoing') }}</dd></div>
              <div><dt>截止时间</dt><dd>{{ previewingTemplate.data.deadline ? formatDateTime(previewingTemplate.data.deadline) : '未设置' }}</dd></div>
              <div><dt>打包形式</dt><dd>{{ downloadStructureLabel(previewingTemplate.data.downloadStructure) }}</dd></div>
            </dl>
          </section>

          <section>
            <h3>收集字段列表</h3>
            <div class="template-preview-fields">
              <span v-if="!previewingTemplate.data.fieldConfig.length">暂无字段</span>
              <span v-for="field in previewingTemplate.data.fieldConfig" :key="field.key">
                {{ field.label }} · {{ fieldTypeLabel(field.type) }}{{ field.required ? ' · 必填' : '' }}
              </span>
            </div>
          </section>

          <section>
            <h3>文件设置摘要</h3>
            <div class="template-preview-chips">
              <span>{{ fileTypeLabel(previewingTemplate.data.fileType || 'document') }}</span>
              <span>{{ templateFileLimitText(previewingTemplate.data) }}</span>
              <span>重命名：{{ previewingTemplate.data.renameEnabled === false ? '否' : '是' }}</span>
              <span>{{ downloadStructureLabel(previewingTemplate.data.downloadStructure) }}</span>
            </div>
          </section>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import { confirmAction, showToast } from '../utils/feedback';

type TemplateCategory = 'course' | 'exam' | 'material';
type TemplateVisibility = 'private' | 'class';
type RepeatMode = 'new' | 'overwrite';
type DownloadStructure = 'task-file' | 'task-field-file';
type TaskTab = 'basic' | 'collect' | 'files';

type AssignmentFieldType =
  | 'name'
  | 'phone'
  | 'email'
  | 'idcard'
  | 'birth_date'
  | 'single_line'
  | 'multi_line'
  | 'numeric'
  | 'digits'
  | 'single_choice'
  | 'multiple_choice'
  | 'datetime'
  | 'positive_integer';

interface ValidationError {
  tab: TaskTab;
  message: string;
  focusId?: string;
  fieldKey?: string;
  fieldRole?: 'label' | 'type' | 'digits' | 'min' | 'max' | 'options';
}

interface FieldRules {
  min?: string;
  max?: string;
  length?: string;
  options?: string[];
}

interface FieldRow {
  key: string;
  label: string;
  type: AssignmentFieldType;
  required: boolean;
  enabled: boolean;
  visible: boolean;
  rules: FieldRules;
  optionText: string;
}

interface TemplateSnapshot {
  title: string;
  description: string;
  deadline: string | null;
  status: string;
  allowLate: boolean;
  allowRepeat: boolean;
  repeatMode: RepeatMode;
  downloadStructure: DownloadStructure;
  requiredUpload: boolean;
  fileType: string;
  enableLimit: boolean;
  maxFileSizeMb: number;
  maxFiles: number;
  allowFolder: boolean;
  renameEnabled: boolean;
  renameFields: string[];
  allowedExtensions: string[];
  fieldConfig: Array<{
    key: string;
    label: string;
    type: AssignmentFieldType;
    category: 'basic' | 'custom';
    required: boolean;
    enabled: boolean;
    visible: boolean;
    rules?: FieldRules;
  }>;
}

interface TemplateRecord {
  id: string;
  name: string;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  createdAt: string;
  updatedAt: string;
  data: TemplateSnapshot;
}

interface PublicConfig {
  publicBaseUrl: string;
  maxUploadSizeMb: number;
  maxUploadFiles: number;
}

const BASIC_FIELD_TYPES: AssignmentFieldType[] = ['name', 'phone', 'email', 'idcard', 'birth_date'];
const CUSTOM_FIELD_TYPES: AssignmentFieldType[] = ['single_line', 'multi_line', 'numeric', 'digits', 'single_choice', 'multiple_choice', 'datetime', 'positive_integer'];

const FIELD_TYPE_LABELS: Record<AssignmentFieldType, string> = {
  name: '姓名',
  phone: '手机号',
  email: '邮箱',
  idcard: '身份证号',
  birth_date: '出生日期',
  single_line: '单行文本',
  multi_line: '多行文本',
  numeric: '纯数值',
  digits: '纯数字',
  single_choice: '单选',
  multiple_choice: '多选',
  datetime: '日期和时间',
  positive_integer: '正整数',
};

const BASIC_FIELD_DEFAULTS: Record<AssignmentFieldType, { key: string; label: string } | undefined> = {
  name: { key: 'studentName', label: '姓名' },
  phone: { key: 'phone', label: '手机号' },
  email: { key: 'email', label: '邮箱' },
  idcard: { key: 'idcard', label: '身份证号' },
  birth_date: { key: 'birthDate', label: '出生日期' },
  single_line: undefined,
  multi_line: undefined,
  numeric: undefined,
  digits: undefined,
  single_choice: undefined,
  multiple_choice: undefined,
  datetime: undefined,
  positive_integer: undefined,
};

const FILE_TYPE_GROUPS: Array<{ type: string; values: string[] }> = [
  { type: 'word', values: ['doc', 'docx'] },
  { type: 'pdf', values: ['pdf'] },
  { type: 'text', values: ['txt'] },
  { type: 'excel', values: ['xls', 'xlsx'] },
  { type: 'ppt', values: ['ppt', 'pptx'] },
  { type: 'image', values: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
  { type: 'video', values: ['mp4', 'mov', 'avi', 'mkv'] },
  { type: 'archive', values: ['zip', 'rar', '7z'] },
  { type: 'installer', values: ['apk', 'exe', 'msi', 'dmg'] },
  { type: 'document', values: ['doc', 'docx', 'pdf', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'] },
];

const RENAME_BUILTINS = [
  { key: 'originalFilename', label: '原文件名' },
  { key: 'submitterName', label: '上传者姓名' },
  { key: 'uploadTime', label: '上传时间' },
];

const TEMPLATE_STORAGE_KEY = 'cloudnote_task_templates';
const LEGACY_TEMPLATE_STORAGE_KEY = 'cloudnoteAssignmentTemplates';
const DRAFT_STORAGE_KEY = 'cloudnoteAssignmentDraft';
const AUTOSAVE_INTERVAL_MS = 15000;

const extensions = [
  { value: 'doc', label: 'Word', small: '.doc' },
  { value: 'docx', label: 'Word', small: '.docx' },
  { value: 'pdf', label: 'PDF', small: '.pdf' },
  { value: 'txt', label: '文本', small: '.txt' },
  { value: 'xls', label: 'Excel', small: '.xls' },
  { value: 'xlsx', label: 'Excel', small: '.xlsx' },
  { value: 'ppt', label: 'PPT', small: '.ppt' },
  { value: 'pptx', label: 'PPT', small: '.pptx' },
  { value: 'jpg', label: '图片', small: '.jpg' },
  { value: 'jpeg', label: '图片', small: '.jpeg' },
  { value: 'png', label: '图片', small: '.png' },
  { value: 'gif', label: '图片', small: '.gif' },
  { value: 'webp', label: '图片', small: '.webp' },
  { value: 'mp4', label: '视频', small: '.mp4' },
  { value: 'mov', label: '视频', small: '.mov' },
  { value: 'avi', label: '视频', small: '.avi' },
  { value: 'mkv', label: '视频', small: '.mkv' },
  { value: 'zip', label: '压缩包', small: '.zip' },
  { value: 'rar', label: '压缩包', small: '.rar' },
  { value: '7z', label: '压缩包', small: '.7z' },
  { value: 'apk', label: '安装包', small: '.apk' },
  { value: 'exe', label: '安装包', small: '.exe' },
  { value: 'msi', label: '安装包', small: '.msi' },
  { value: 'dmg', label: '安装包', small: '.dmg' },
];

const route = useRoute();
const router = useRouter();

const isEditing = computed(() => Boolean(route.params.id));
const activeTab = ref<TaskTab>('basic');
const message = ref('');
const success = ref(false);
const noDeadline = ref(false);
const deadlineLocal = ref('');
const selectedFieldKeys = ref<string[]>([]);
const draftStatusText = ref('已自动保存 · 每15秒更新');
const hasSubmittedCreateForm = ref(false);
const editingTemplateId = ref('');
const showSaveTemplateModal = ref(false);
const fieldTypeModalOpen = ref(false);
const templateModalOpen = ref(false);
const templateModalMode = ref<'picker' | 'manage'>('manage');
const templateSearch = ref('');
const templateCategoryFilter = ref('');
const selectedTemplateIds = ref<string[]>([]);
const previewingTemplate = ref<TemplateRecord | null>(null);
const renameRuleOpen = ref(false);
const fieldDraftLabels = reactive<Record<string, string>>({});
const fieldNameErrors = reactive<Record<string, string>>({});
const templateStore = ref<TemplateRecord[]>([]);

const templateForm = reactive({
  name: '',
  category: 'course' as TemplateCategory,
  visibility: 'private' as TemplateVisibility,
});

const systemConfig = reactive<PublicConfig>({
  publicBaseUrl: window.location.origin,
  maxUploadSizeMb: 500,
  maxUploadFiles: 20,
});

const form = reactive({
  title: '',
  description: '',
  status: 'ongoing',
  allowRepeat: true,
  allowLate: false,
  repeatMode: 'overwrite' as RepeatMode,
  downloadStructure: 'task-file' as DownloadStructure,
  collectFields: [] as FieldRow[],
  fileRules: {
    requiredUpload: true,
    fileType: 'document',
    allowedExtensions: ['doc', 'docx', 'pdf', 'zip'] as string[],
    enableLimit: true,
    maxFileSizeMB: 100,
    maxFileCount: 1,
    enableRename: true,
    renameFields: ['originalFilename'] as string[],
    allowFolder: true,
  },
});

let autosaveTimer: ReturnType<typeof setInterval> | null = null;
let suppressDraftWatch = false;

const renameFields = computed(() => form.fileRules.renameFields);
const renameFieldValue = computed(() => renameFields.value.join(','));
const renameOptions = computed(() => {
  const dynamic = form.collectFields.map((field) => ({ key: field.key, label: field.label || field.key }));
  const seen = new Set<string>();
  return [...RENAME_BUILTINS, ...dynamic].filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
});
const renamePreview = computed(() => {
  const labels = renameFields.value
    .map((key) => renameOptions.value.find((item) => item.key === key)?.label || key)
    .filter(Boolean);
  return labels.length ? labels.join('_') : '原文件名';
});
const filteredTemplates = computed(() => {
  const keyword = templateSearch.value.trim().toLowerCase();
  return templateStore.value.filter((item) => {
    const byKeyword = !keyword || item.name.toLowerCase().includes(keyword);
    const byCategory = !templateCategoryFilter.value || item.category === templateCategoryFilter.value;
    return byKeyword && byCategory;
  });
});
const allTemplateSelected = computed(() => filteredTemplates.value.length > 0 && filteredTemplates.value.every((item) => selectedTemplateIds.value.includes(item.id)));
const saveTemplateButtonText = computed(() => (editingTemplateId.value ? '保存' : '保存模板'));

const validationErrors = computed(() => collectValidationErrors());
const tabErrorCounts = computed<Record<TaskTab, number>>(() => {
  const counts: Record<TaskTab, number> = { basic: 0, collect: 0, files: 0 };
  validationErrors.value.forEach((error) => {
    counts[error.tab] += 1;
  });
  return counts;
});
const tabCompleteState = computed<Record<TaskTab, boolean>>(() => {
  const snapshot = buildSnapshot();
  const basic = Boolean(snapshot.title.trim() && (noDeadline.value || snapshot.deadline));
  const collect = snapshot.fieldConfig.every((field) => field.label.trim().length > 0);
  const files =
    !snapshot.enableLimit ||
    (Number.isInteger(snapshot.maxFiles) &&
      snapshot.maxFiles >= 1 &&
      snapshot.maxFiles <= systemConfig.maxUploadFiles &&
      Number.isInteger(snapshot.maxFileSizeMb) &&
      snapshot.maxFileSizeMb >= 1 &&
      snapshot.maxFileSizeMb <= systemConfig.maxUploadSizeMb);
  return { basic, collect, files };
});

function fieldTypeLabel(type: AssignmentFieldType): string {
  return FIELD_TYPE_LABELS[type] || type;
}

function categoryLabel(category: TemplateCategory): string {
  return { course: '课程作业', exam: '测试收集', material: '材料归集' }[category] || '课程作业';
}

function visibilityLabel(visibility: TemplateVisibility): string {
  return visibility === 'class' ? '班级共享' : '仅自己可见';
}

function statusLabel(value: string): string {
  return { ongoing: '进行中', expired: '已过期', ended: '已结束', archived: '已归档', deleted: '已删除', completed: '已完成' }[value] || value;
}

function fileTypeLabel(value: string): string {
  return {
    any: '不限类型',
    word: 'Word',
    pdf: 'PDF',
    text: '文本',
    excel: 'Excel',
    ppt: 'PPT',
    image: '图片',
    video: '视频',
    archive: '压缩包',
    installer: '安装包',
    document: '文档/文本',
    custom: '自定义组合',
  }[value] || value || '文档/文本';
}

function downloadStructureLabel(value: DownloadStructure | string | undefined): string {
  return value === 'task-file' ? '任务/文件' : '任务/提交者/文件';
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getTodayEndDatetimeLocal(): string {
  const now = new Date();
  now.setHours(23, 59, 0, 0);
  return toDatetimeLocal(now.toISOString());
}

function deadlineToLocalValue(value: string | null | undefined, fallbackToToday = false): string {
  if (value) return toDatetimeLocal(value);
  return fallbackToToday ? getTodayEndDatetimeLocal() : '';
}

function isBasicField(type: AssignmentFieldType): boolean {
  return BASIC_FIELD_TYPES.includes(type);
}

function hasFieldType(type: AssignmentFieldType): boolean {
  return form.collectFields.some((field) => field.type === type);
}

function nextFieldKey(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function createField(type: AssignmentFieldType = 'single_line'): FieldRow {
  const basic = BASIC_FIELD_DEFAULTS[type];
  return {
    key: basic?.key || nextFieldKey(),
    label: basic?.label || '新字段',
    type,
    required: false,
    enabled: true,
    visible: true,
    rules: {},
    optionText: type === 'multiple_choice' ? '选项一, 选项二, 选项三' : type === 'single_choice' ? '选项一, 选项二' : '',
  };
}

function normalizeField(field: Partial<FieldRow>): FieldRow {
  const type = (field.type || 'single_line') as AssignmentFieldType;
  return {
    key: field.key || BASIC_FIELD_DEFAULTS[type]?.key || nextFieldKey(),
    label: field.label || BASIC_FIELD_DEFAULTS[type]?.label || '新字段',
    type,
    required: Boolean(field.required),
    enabled: field.enabled !== false,
    visible: field.visible !== false,
    rules: { ...(field.rules || {}) },
    optionText: Array.isArray(field.rules?.options) ? field.rules.options.join(', ') : field.optionText || '',
  };
}

function normalizeSnapshot(snapshot?: Partial<TemplateSnapshot> | Record<string, unknown>): TemplateSnapshot {
  const source = (snapshot || {}) as Partial<TemplateSnapshot> & {
    collectFields?: TemplateSnapshot['fieldConfig'];
    basicInfo?: Partial<TemplateSnapshot>;
    fileSettings?: Partial<TemplateSnapshot> & {
      maxFileSizeMB?: number;
      maxFileCount?: number;
      enableRename?: boolean;
    };
    fileRules?: Partial<TemplateSnapshot> & {
      maxFileSizeMB?: number;
      maxFileCount?: number;
      enableRename?: boolean;
    };
    maxFileSizeMB?: number;
    maxFileCount?: number;
    enableRename?: boolean;
  };
  const basicInfo = source.basicInfo || {};
  const fileSettings = source.fileSettings || source.fileRules || {};
  const fieldConfig = Array.isArray(source.fieldConfig)
    ? source.fieldConfig
    : Array.isArray(source.collectFields)
      ? source.collectFields
      : [];
  const deadlineSource = source.deadline ?? basicInfo.deadline ?? null;
  const repeatModeSource = source.repeatMode ?? basicInfo.repeatMode;
  const downloadStructureSource = source.downloadStructure ?? basicInfo.downloadStructure;
  const requiredUploadSource = source.requiredUpload ?? fileSettings.requiredUpload;
  const fileTypeSource = source.fileType ?? fileSettings.fileType;
  const enableLimitSource = source.enableLimit ?? fileSettings.enableLimit;
  const maxFileSizeSource = source.maxFileSizeMb ?? source.maxFileSizeMB ?? fileSettings.maxFileSizeMb ?? fileSettings.maxFileSizeMB;
  const maxFilesSource = source.maxFiles ?? source.maxFileCount ?? fileSettings.maxFiles ?? fileSettings.maxFileCount;
  const allowFolderSource = source.allowFolder ?? fileSettings.allowFolder;
  const renameEnabledSource = source.renameEnabled ?? source.enableRename ?? fileSettings.renameEnabled ?? fileSettings.enableRename;
  const renameFieldsSource = source.renameFields ?? fileSettings.renameFields;
  const allowedExtensionsSource = source.allowedExtensions ?? fileSettings.allowedExtensions;
  return {
    title: String(source.title ?? basicInfo.title ?? ''),
    description: String(source.description ?? basicInfo.description ?? ''),
    deadline: deadlineSource || null,
    status: String(source.status ?? basicInfo.status ?? 'ongoing'),
    allowLate: Boolean(source.allowLate ?? basicInfo.allowLate),
    allowRepeat: (source.allowRepeat ?? basicInfo.allowRepeat) !== false,
    repeatMode: repeatModeSource === 'new' ? 'new' : 'overwrite',
    downloadStructure: downloadStructureSource === 'task-field-file' ? 'task-field-file' : 'task-file',
    requiredUpload: requiredUploadSource !== false,
    fileType: String(fileTypeSource || 'document'),
    enableLimit: Boolean(enableLimitSource),
    maxFileSizeMb: Number(maxFileSizeSource || 100),
    maxFiles: Number(maxFilesSource || 1),
    allowFolder: allowFolderSource !== false,
    renameEnabled: renameEnabledSource !== false,
    renameFields: Array.isArray(renameFieldsSource) && renameFieldsSource.length ? [...renameFieldsSource] : ['originalFilename'],
    allowedExtensions: Array.isArray(allowedExtensionsSource) ? [...allowedExtensionsSource] : ['doc', 'docx', 'pdf', 'zip'],
    fieldConfig: fieldConfig.map((field) => ({
      key: String(field.key || nextFieldKey()),
      label: String(field.label || (field as { name?: string }).name || ''),
      type: (field.type || 'single_line') as AssignmentFieldType,
      category: field.category === 'basic' ? 'basic' : 'custom',
      required: Boolean(field.required),
      enabled: field.enabled !== false,
      visible: field.visible !== false,
      rules: { ...(field.rules || {}) },
    })),
  };
}

function normalizeTemplateRecord(template: Partial<TemplateRecord> & { data?: Partial<TemplateSnapshot> | Record<string, unknown> }, index = 0): TemplateRecord {
  const normalizedData = normalizeSnapshot(
    template.data || {
      ...(template as unknown as { basicInfo?: Record<string, unknown> }).basicInfo,
      ...(template as unknown as { fileSettings?: Record<string, unknown> }).fileSettings,
      collectFields: (template as unknown as { collectFields?: unknown[] }).collectFields,
    }
  );
  return {
    id: String(template.id || `template-${Date.now()}-${index}`),
    name: String(template.name || normalizedData.title || '未命名模板'),
    category: (template.category || 'course') as TemplateCategory,
    visibility: (template.visibility || 'private') as TemplateVisibility,
    createdAt: String(template.createdAt || new Date().toISOString()),
    updatedAt: String(template.updatedAt || template.createdAt || new Date().toISOString()),
    data: normalizedData,
  };
}

function syncFieldDraft(field: Pick<FieldRow, 'key' | 'label'>): void {
  fieldDraftLabels[field.key] = field.label;
  delete fieldNameErrors[field.key];
}

function dropFieldDraft(key?: string): void {
  if (!key) return;
  delete fieldDraftLabels[key];
  delete fieldNameErrors[key];
}

function markDraftDirty(): void {
  if (suppressDraftWatch) return;
  draftStatusText.value = '有未保存更改 · 每15秒更新';
}

function setMessage(text = '', isOk = false): void {
  message.value = text;
  success.value = isOk;
}

function inferFileType(allowedExtensions: string[]): string {
  const normalized = [...new Set(allowedExtensions.map((item) => item.trim()).filter(Boolean))].sort();
  if (!normalized.length) return 'any';
  const exact = FILE_TYPE_GROUPS.find((group) => {
    const values = [...group.values].sort();
    return values.length === normalized.length && values.every((value, index) => value === normalized[index]);
  });
  return exact?.type || 'custom';
}

function handleExtensionChange(): void {
  form.fileRules.fileType = inferFileType(form.fileRules.allowedExtensions);
  markDraftDirty();
}

function handleRenameEnabledChange(): void {
  if (!form.fileRules.enableRename) renameRuleOpen.value = false;
  markDraftDirty();
}

function toggleRenamePopover(): void {
  if (!form.fileRules.enableRename) return;
  renameRuleOpen.value = !renameRuleOpen.value;
}

function openFieldTypeModal(): void {
  fieldTypeModalOpen.value = true;
}

function closeFieldTypeModal(): void {
  fieldTypeModalOpen.value = false;
}

function addField(type: AssignmentFieldType = 'single_line'): void {
  if (isBasicField(type) && hasFieldType(type)) {
    const text = `${fieldTypeLabel(type)}只能添加一次`;
    setMessage(text, false);
    showToast(text, 'error');
    return;
  }
  const field = createField(type);
  form.collectFields.push(field);
  syncFieldDraft(field);
  markDraftDirty();
}

function handleFieldTypePick(type: AssignmentFieldType): void {
  const before = form.collectFields.length;
  addField(type);
  if (form.collectFields.length > before) closeFieldTypeModal();
}

function handleFieldTypeChange(field: FieldRow): void {
  const basic = BASIC_FIELD_DEFAULTS[field.type];
  if (basic) {
    field.key = basic.key;
    field.label = basic.label;
  }
  field.rules = {};
  field.optionText = field.type === 'multiple_choice' ? '选项一, 选项二, 选项三' : field.type === 'single_choice' ? '选项一, 选项二' : '';
  syncFieldDraft(field);
  markDraftDirty();
}

function removeField(index: number): void {
  const removedKey = form.collectFields[index]?.key;
  form.collectFields.splice(index, 1);
  if (removedKey) selectedFieldKeys.value = selectedFieldKeys.value.filter((key) => key !== removedKey);
  dropFieldDraft(removedKey);
  markDraftDirty();
}

function moveField(index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= form.collectFields.length) return;
  const list = [...form.collectFields];
  [list[index], list[target]] = [list[target], list[index]];
  form.collectFields = list as FieldRow[];
  markDraftDirty();
}

async function confirmRemoveField(index: number): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除字段',
    message: '确定删除这个字段吗？',
    confirmText: '删除',
    variant: 'danger',
  });
  if (!confirmed) return;
  removeField(index);
}

async function deleteSelectedFields(): Promise<void> {
  if (!selectedFieldKeys.value.length) {
    setMessage('请先选择要删除的信息字段', false);
    showToast('请先选择要删除的信息字段', 'error');
    return;
  }
  const confirmed = await confirmAction({
    title: '删除信息字段',
    message: `确定删除选中的 ${selectedFieldKeys.value.length} 个信息字段吗？`,
    confirmText: '删除',
    variant: 'danger',
  });
  if (!confirmed) return;
  form.collectFields = form.collectFields.filter((field) => !selectedFieldKeys.value.includes(field.key)) as FieldRow[];
  Object.keys(fieldDraftLabels).forEach((key) => {
    if (selectedFieldKeys.value.includes(key)) dropFieldDraft(key);
  });
  selectedFieldKeys.value = [];
  markDraftDirty();
}

function handleNoDeadlineToggle(): void {
  if (noDeadline.value) deadlineLocal.value = '';
  else if (!deadlineLocal.value) deadlineLocal.value = getTodayEndDatetimeLocal();
  markDraftDirty();
}

function handleFieldLabelInput(field: FieldRow, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  fieldDraftLabels[field.key] = value;
  if (value.trim()) delete fieldNameErrors[field.key];
  markDraftDirty();
}

function restoreFieldLabel(field: FieldRow): void {
  fieldDraftLabels[field.key] = field.label;
  delete fieldNameErrors[field.key];
}

function confirmFieldLabel(field: FieldRow, focusOnError = false): boolean {
  if (isBasicField(field.type)) {
    syncFieldDraft(field);
    return true;
  }
  const nextLabel = String(fieldDraftLabels[field.key] ?? field.label).trim();
  if (!nextLabel) {
    fieldNameErrors[field.key] = '信息名称不能为空';
    if (focusOnError) focusErrorTarget({ tab: 'collect', message: '信息名称不能为空', fieldKey: field.key, fieldRole: 'label' });
    return false;
  }
  field.label = nextLabel;
  syncFieldDraft(field);
  markDraftDirty();
  return true;
}

function commitAllFieldLabels(focusOnError = false): boolean {
  for (const field of form.collectFields) {
    if (!confirmFieldLabel(field, focusOnError)) return false;
  }
  return true;
}

function toggleRenameField(key: string): void {
  const set = new Set(renameFields.value);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  form.fileRules.renameFields = [...set];
  markDraftDirty();
}

function ruleTextFor(type: AssignmentFieldType): string {
  const map: Partial<Record<AssignmentFieldType, string>> = {
    name: '中文1-5 / 英文1-20',
    phone: '大陆手机号',
    email: '邮箱格式',
    idcard: '15/18位身份证',
    birth_date: '1900-01-01 至今',
    single_line: '1-50字',
    multi_line: '1-1000字',
    datetime: '日期 + 时间',
    positive_integer: '大于 0 的整数',
  };
  return map[type] || '按系统规则校验';
}

function toFieldPayload(field: FieldRow) {
  const options = field.optionText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const rules: FieldRules = {};
  if (field.type === 'digits' && field.rules.length) rules.length = String(field.rules.length);
  if (field.type === 'numeric') {
    if (field.rules.min !== undefined && field.rules.min !== '') rules.min = String(field.rules.min);
    if (field.rules.max !== undefined && field.rules.max !== '') rules.max = String(field.rules.max);
  }
  if ((field.type === 'single_choice' || field.type === 'multiple_choice') && options.length) rules.options = options;
  return {
    key: field.key,
    label: field.label.trim(),
    type: field.type,
    category: isBasicField(field.type) ? 'basic' : 'custom',
    required: field.required,
    enabled: field.enabled,
    visible: field.visible,
    rules,
  };
}

function buildSnapshot(): TemplateSnapshot {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    deadline: noDeadline.value ? null : deadlineLocal.value ? new Date(deadlineLocal.value).toISOString() : null,
    status: form.status,
    allowLate: form.allowLate,
    allowRepeat: form.allowRepeat,
    repeatMode: form.repeatMode,
    downloadStructure: form.downloadStructure,
    requiredUpload: form.fileRules.requiredUpload,
    fileType: form.fileRules.fileType,
    enableLimit: form.fileRules.enableLimit,
    maxFileSizeMb: Number(form.fileRules.maxFileSizeMB),
    maxFiles: Number(form.fileRules.maxFileCount),
    allowFolder: form.fileRules.allowFolder,
    renameEnabled: form.fileRules.enableRename,
    renameFields: [...form.fileRules.renameFields],
    allowedExtensions: [...form.fileRules.allowedExtensions],
    fieldConfig: form.collectFields.filter((field) => field.label.trim()).map(toFieldPayload),
  };
}

function collectValidationErrors(): ValidationError[] {
  const errors: ValidationError[] = [];
  const addError = (error: ValidationError): void => {
    errors.push(error);
  };

  if (!form.title.trim()) addError({ tab: 'basic', message: '请填写任务标题', focusId: 'title' });
  if (!noDeadline.value && !deadlineLocal.value) addError({ tab: 'basic', message: '请选择截止时间', focusId: 'deadline' });

  form.collectFields.forEach((field) => {
    const label = String(fieldDraftLabels[field.key] ?? field.label).trim();
    if (!label) addError({ tab: 'collect', message: '收集字段名称不能为空', fieldKey: field.key, fieldRole: 'label' });

    if (field.type === 'single_choice' || field.type === 'multiple_choice') {
      const rawOptions = field.optionText.split(',').map((item) => item.trim());
      const options = rawOptions.filter(Boolean);
      const min = field.type === 'single_choice' ? 2 : 3;
      if (rawOptions.some((item) => !item)) addError({ tab: 'collect', message: `${label || '该字段'} 选项不可为空`, fieldKey: field.key, fieldRole: 'options' });
      else if (options.length < min) addError({ tab: 'collect', message: `${label || '该字段'} 至少填写 ${min} 个选项`, fieldKey: field.key, fieldRole: 'options' });
      else if (options.some((item) => item.length > 50)) addError({ tab: 'collect', message: `${label || '该字段'} 每个选项长度需为 1-50`, fieldKey: field.key, fieldRole: 'options' });
      else if (new Set(options).size !== options.length) addError({ tab: 'collect', message: `${label || '该字段'} 选项不可重复`, fieldKey: field.key, fieldRole: 'options' });
    }

    if (field.type === 'digits' && field.rules.length && (!/^\d+$/.test(String(field.rules.length)) || Number(field.rules.length) < 1 || Number(field.rules.length) > 30)) {
      addError({ tab: 'collect', message: `${label || '该字段'} 位数需为 1-30`, fieldKey: field.key, fieldRole: 'digits' });
    }
  });

  if (!form.allowRepeat) {
    const hasIdentityField = form.collectFields.some((field) => ['name', 'phone', 'email', 'idcard'].includes(field.type) || field.key === 'studentName' || field.key === 'studentId');
    if (!hasIdentityField) addError({ tab: 'collect', message: '禁止重复提交时，至少保留一个可识别身份的字段', focusId: 'add-field' });
  }

  if (form.fileRules.enableLimit) {
    if (!Number.isInteger(form.fileRules.maxFileCount) || form.fileRules.maxFileCount < 1 || form.fileRules.maxFileCount > systemConfig.maxUploadFiles) {
      addError({ tab: 'files', message: `文件数量需为 1-${systemConfig.maxUploadFiles}`, focusId: 'max-file-count' });
    }
    if (!Number.isInteger(form.fileRules.maxFileSizeMB) || form.fileRules.maxFileSizeMB < 1 || form.fileRules.maxFileSizeMB > systemConfig.maxUploadSizeMb) {
      addError({ tab: 'files', message: `单文件大小需为 1-${systemConfig.maxUploadSizeMb} MB`, focusId: 'max-file-size' });
    }
  }

  return errors;
}

function focusErrorTarget(error: ValidationError): void {
  activeTab.value = error.tab;
  requestAnimationFrame(() => {
    if (error.fieldKey) {
      const row = document.querySelector<HTMLElement>(`.collect-field-row[data-field-key="${error.fieldKey}"]`);
      const target = error.fieldRole ? row?.querySelector<HTMLElement>(`[data-field-role="${error.fieldRole}"]`) : row;
      target?.focus?.();
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (error.focusId) {
      const target = document.querySelector<HTMLElement>(`[data-focus-id="${error.focusId}"]`);
      target?.focus?.();
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  });
}

function validateBeforeSubmit(): ValidationError | null {
  hasSubmittedCreateForm.value = true;
  if (!commitAllFieldLabels(true)) return { tab: 'collect', message: '收集字段名称不能为空' };
  const firstError = validationErrors.value[0];
  if (!firstError) return null;
  return firstError;
}

function applySnapshot(snapshotLike: Partial<TemplateSnapshot> | Record<string, unknown>): void {
  const snapshot = normalizeSnapshot(snapshotLike);
  suppressDraftWatch = true;
  form.title = snapshot.title;
  form.description = snapshot.description;
  form.status = snapshot.status || 'ongoing';
  form.allowLate = Boolean(snapshot.allowLate);
  form.allowRepeat = snapshot.allowRepeat !== false;
  form.repeatMode = snapshot.repeatMode || 'overwrite';
  form.downloadStructure = snapshot.downloadStructure || 'task-file';
  noDeadline.value = !snapshot.deadline;
  deadlineLocal.value = noDeadline.value ? '' : deadlineToLocalValue(snapshot.deadline, true);
  form.collectFields = snapshot.fieldConfig.map((field) =>
    normalizeField({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      enabled: field.enabled,
      visible: field.visible,
      rules: field.rules || {},
      optionText: Array.isArray(field.rules?.options) ? field.rules.options.join(', ') : '',
    })
  ) as FieldRow[];
  form.fileRules.requiredUpload = snapshot.requiredUpload !== false;
  form.fileRules.fileType = snapshot.fileType || inferFileType(snapshot.allowedExtensions || []);
  form.fileRules.allowedExtensions = [...snapshot.allowedExtensions];
  form.fileRules.enableLimit = Boolean(snapshot.enableLimit);
  form.fileRules.maxFileSizeMB = Number(snapshot.maxFileSizeMb || 100);
  form.fileRules.maxFileCount = Number(snapshot.maxFiles || 1);
  form.fileRules.enableRename = snapshot.renameEnabled !== false;
  form.fileRules.renameFields = [...(snapshot.renameFields?.length ? snapshot.renameFields : ['originalFilename'])];
  form.fileRules.allowFolder = snapshot.allowFolder !== false;
  selectedFieldKeys.value = [];
  renameRuleOpen.value = false;
  Object.keys(fieldDraftLabels).forEach((key) => delete fieldDraftLabels[key]);
  Object.keys(fieldNameErrors).forEach((key) => delete fieldNameErrors[key]);
  form.collectFields.forEach((field) => syncFieldDraft(field));
  draftStatusText.value = '已自动保存 · 每15秒更新';
  suppressDraftWatch = false;
}

async function handleSubmit(): Promise<void> {
  const error = validateBeforeSubmit();
  if (error) {
    setMessage(error.message, false);
    showToast(error.message, 'error');
    focusErrorTarget(error);
    return;
  }

  const snapshot = buildSnapshot();
  const payload = {
    title: snapshot.title,
    description: snapshot.description,
    deadline: snapshot.deadline,
    status: snapshot.status,
    allowLate: snapshot.allowLate,
    allowRepeat: snapshot.allowRepeat,
    repeatMode: snapshot.repeatMode,
    downloadStructure: snapshot.downloadStructure,
    collectFields: snapshot.fieldConfig,
    fileRules: {
      requiredUpload: snapshot.requiredUpload,
      fileType: snapshot.fileType,
      allowedExtensions: snapshot.allowedExtensions,
      enableLimit: snapshot.enableLimit,
      maxFileSizeMB: snapshot.maxFileSizeMb,
      maxFileCount: snapshot.maxFiles,
      enableRename: snapshot.renameEnabled,
      renameFields: snapshot.renameFields,
      allowFolder: snapshot.allowFolder,
    },
  };

  try {
    if (isEditing.value) await api.put('/admin/assignments/' + route.params.id, payload);
    else await api.post('/admin/assignments', payload);
    setMessage(isEditing.value ? '任务已更新' : '任务已发布', true);
    showToast(isEditing.value ? '任务已更新' : '任务已发布', 'success');
    clearDraft();
    editingTemplateId.value = '';
    if (!isEditing.value) router.push('/assignments');
  } catch (error) {
    const text = (error as Error).message || '保存任务失败';
    setMessage(text, false);
    showToast(text, 'error');
  }
}

async function loadPublicConfig(): Promise<void> {
  try {
    const config = await api.get<PublicConfig>('/open/config');
    if (config.publicBaseUrl) systemConfig.publicBaseUrl = config.publicBaseUrl;
    if (Number(config.maxUploadSizeMb) > 0) systemConfig.maxUploadSizeMb = Number(config.maxUploadSizeMb);
    if (Number(config.maxUploadFiles) > 0) systemConfig.maxUploadFiles = Number(config.maxUploadFiles);
  } catch {}
}

async function loadAssignment(): Promise<void> {
  if (!route.params.id) return;
  try {
    const assignment = await api.get<any>('/admin/assignments/' + route.params.id);
    applySnapshot({
      title: assignment.title,
      description: assignment.description || '',
      deadline: assignment.deadline,
      status: assignment.status || 'ongoing',
      allowLate: Boolean(assignment.allowLate),
      allowRepeat: assignment.allowRepeat !== false,
      repeatMode: assignment.repeatMode || 'new',
      downloadStructure: assignment.downloadStructure || 'task-field-file',
      requiredUpload: assignment.fileRules?.requiredUpload !== false,
      fileType: assignment.fileRules?.fileType || inferFileType(assignment.fileRules?.allowedExtensions || []),
      enableLimit: Boolean(assignment.fileRules?.enableLimit),
      maxFileSizeMb: Number(assignment.fileRules?.maxFileSizeMB || 100),
      maxFiles: Number(assignment.fileRules?.maxFileCount || 1),
      allowFolder: assignment.fileRules?.allowFolder !== false,
      renameEnabled: assignment.fileRules?.enableRename !== false,
      renameFields: assignment.fileRules?.renameFields || ['originalFilename'],
      allowedExtensions: assignment.fileRules?.allowedExtensions || ['doc', 'docx', 'pdf', 'zip'],
      fieldConfig: assignment.collectFields || [],
    });
  } catch (error) {
    const text = (error as Error).message || '加载任务失败';
    setMessage(text, false);
    showToast(text, 'error');
  }
}

function saveDraftNow(): void {
  if (isEditing.value) return;
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(buildSnapshot()));
  draftStatusText.value = '已自动保存 · 每15秒更新';
}

function restoreDraft(): void {
  if (isEditing.value) return;
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return;
  try {
    applySnapshot(JSON.parse(raw) as TemplateSnapshot);
    setMessage('已恢复本地草稿', true);
    showToast('已恢复本地草稿', 'success');
  } catch {}
}

function clearDraft(): void {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  draftStatusText.value = '已自动保存 · 每15秒更新';
}

function loadLocalTemplates(): void {
  const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY) || localStorage.getItem(LEGACY_TEMPLATE_STORAGE_KEY);
  if (!raw) {
    templateStore.value = [];
    return;
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<TemplateRecord>>;
    templateStore.value = parsed.map((item, index) => normalizeTemplateRecord(item, index));
    persistLocalTemplates();
  } catch {
    templateStore.value = [];
  }
}

function persistLocalTemplates(): void {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateStore.value));
}

async function loadTemplates(): Promise<void> {
  try {
    const response = await api.get<{ items: Array<{ id: number; name: string; category: TemplateCategory; visibility: TemplateVisibility; data: Record<string, unknown>; createdAt: string; updatedAt: string }> }>('/admin/templates?perPage=100');
    templateStore.value = (response.items || []).map((item, index) =>
      normalizeTemplateRecord(
        {
          id: String(item.id),
          name: item.name,
          category: item.category,
          visibility: item.visibility,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          data: item.data,
        },
        index
      )
    );
    persistLocalTemplates();
  } catch {
    loadLocalTemplates();
  }
}

function openSaveTemplateModal(): void {
  templateForm.name = form.title.trim() || '';
  templateForm.category = 'course';
  templateForm.visibility = 'private';
  if (editingTemplateId.value) {
    const current = templateStore.value.find((item) => item.id === editingTemplateId.value);
    if (current) {
      templateForm.name = current.name;
      templateForm.category = current.category;
      templateForm.visibility = current.visibility;
    }
  }
  showSaveTemplateModal.value = true;
}

function handleSaveTemplateEntry(): void {
  const error = validateBeforeSubmit();
  if (error) {
    setMessage(error.message, false);
    showToast(error.message, 'error');
    focusErrorTarget(error);
    return;
  }
  if (!editingTemplateId.value) {
    openSaveTemplateModal();
    return;
  }
  void saveTemplate();
}

async function saveTemplate(): Promise<void> {
  const validationError = validateBeforeSubmit();
  if (validationError) {
    setMessage(validationError.message, false);
    showToast(validationError.message, 'error');
    focusErrorTarget(validationError);
    return;
  }
  const name = templateForm.name.trim();
  if (!name) {
    showToast('模板名称不能为空', 'error');
    return;
  }
  const snapshot = buildSnapshot();
  const isOverwrite = Boolean(editingTemplateId.value);
  try {
    let saved: TemplateRecord;
    if (isOverwrite) {
      const result = await api.put<any>(`/admin/templates/${editingTemplateId.value}`, {
        name,
        category: templateForm.category,
        visibility: templateForm.visibility,
        data: snapshot,
      });
      saved = normalizeTemplateRecord(
        {
          id: String(result.id),
          name: result.name,
          category: result.category,
          visibility: result.visibility,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          data: result.data,
        },
        0
      );
    } else {
      const result = await api.post<any>('/admin/templates', {
        name,
        category: templateForm.category,
        visibility: templateForm.visibility,
        data: snapshot,
      });
      saved = normalizeTemplateRecord(
        {
          id: String(result.id),
          name: result.name,
          category: result.category,
          visibility: result.visibility,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          data: result.data,
        },
        0
      );
    }
    templateStore.value = [saved, ...templateStore.value.filter((item) => item.id !== saved.id)];
    persistLocalTemplates();
    editingTemplateId.value = saved.id;
    showSaveTemplateModal.value = false;
    setMessage(isOverwrite ? '模板已覆盖保存' : '模板已保存', true);
    showToast(isOverwrite ? '模板已覆盖保存' : '模板已保存', 'success');
  } catch (error) {
    const text = (error as Error).message || '保存模板失败';
    showToast(text, 'error');
  }
}

function openTemplateModal(mode: 'picker' | 'manage'): void {
  templateModalMode.value = mode;
  templateModalOpen.value = true;
  templateSearch.value = '';
  templateCategoryFilter.value = '';
  selectedTemplateIds.value = [];
}

function closeTemplateModal(): void {
  templateModalOpen.value = false;
  selectedTemplateIds.value = [];
}

function toggleTemplateSelection(id: string, checked: boolean): void {
  const set = new Set(selectedTemplateIds.value);
  if (checked) set.add(id);
  else set.delete(id);
  selectedTemplateIds.value = [...set];
}

function toggleAllTemplates(checked: boolean): void {
  selectedTemplateIds.value = checked ? filteredTemplates.value.map((item) => item.id) : [];
}

async function deleteTemplate(template: TemplateRecord): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除模板',
    message: `确定删除模板“${template.name}”吗？删除后可在回收站恢复。`,
    confirmText: '删除',
    variant: 'danger',
  });
  if (!confirmed) return;
  try {
    await api.del(`/admin/templates/${template.id}`);
    templateStore.value = templateStore.value.filter((item) => item.id !== template.id);
    persistLocalTemplates();
    setMessage('模板已进入回收站', true);
    showToast('模板已进入回收站', 'success');
  } catch (error) {
    showToast((error as Error).message || '删除模板失败', 'error');
  }
}

async function deleteSelectedTemplates(): Promise<void> {
  const ids = [...selectedTemplateIds.value];
  if (!ids.length) return;
  const confirmed = await confirmAction({
    title: '批量删除模板',
    message: `确定删除选中的 ${ids.length} 个模板吗？删除后可在回收站恢复。`,
    confirmText: '删除',
    variant: 'danger',
  });
  if (!confirmed) return;
  try {
    await Promise.all(ids.map((id) => api.del(`/admin/templates/${id}`)));
    templateStore.value = templateStore.value.filter((item) => !ids.includes(item.id));
    persistLocalTemplates();
    selectedTemplateIds.value = [];
    setMessage('已批量删除模板，模板已进入回收站', true);
    showToast('已批量删除模板，模板已进入回收站', 'success');
  } catch (error) {
    showToast((error as Error).message || '批量删除模板失败', 'error');
  }
}

async function applyTemplate(template: TemplateRecord): Promise<void> {
  let snapshot = normalizeSnapshot(template.data);
  const currentDeadline = noDeadline.value ? null : deadlineLocal.value ? new Date(deadlineLocal.value).toISOString() : null;
  if (form.title.trim() || currentDeadline) {
    const overwrite = await confirmAction({
      title: '套用模板',
      message: '当前已填写任务标题或截止时间，是否使用模板中的标题和截止时间覆盖？',
      confirmText: '覆盖并套用',
    });
    if (!overwrite) {
      snapshot = {
        ...snapshot,
        title: form.title,
        deadline: currentDeadline,
      };
    }
  }
  applySnapshot(snapshot);
  editingTemplateId.value = template.id;
  closeTemplateModal();
  setMessage(`模板已套用：${template.name}`, true);
  showToast(`模板已套用：${template.name}`, 'success');
}

function editTemplate(template: TemplateRecord): void {
  applySnapshot(template.data);
  editingTemplateId.value = template.id;
  closeTemplateModal();
  setMessage(`正在编辑模板：${template.name}`, true);
}

function previewTemplate(template: TemplateRecord): void {
  previewingTemplate.value = template;
}

function templateFieldCount(template: TemplateRecord): number {
  return template.data.fieldConfig?.length || 0;
}

function templateRequiredFieldCount(template: TemplateRecord): number {
  return (template.data.fieldConfig || []).filter((field) => field.required).length;
}

function templateFileLimitText(snapshotLike: Partial<TemplateSnapshot> | Record<string, unknown>): string {
  const snapshot = normalizeSnapshot(snapshotLike);
  if (!snapshot.enableLimit) {
    return `系统最大 ${systemConfig.maxUploadFiles} 个 / 单文件 ${systemConfig.maxUploadSizeMb}MB`;
  }
  return `${snapshot.maxFileSizeMb || 100}MB / ${Math.min(Number(snapshot.maxFiles || 1), systemConfig.maxUploadFiles)}个`;
}

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (renameRuleOpen.value && !target?.closest('[data-section-panel="create"] .rename-rule-box')) {
    renameRuleOpen.value = false;
  }
}

watch(
  () => [
    form.title,
    form.description,
    form.status,
    form.allowRepeat,
    form.allowLate,
    form.repeatMode,
    form.downloadStructure,
    noDeadline.value,
    deadlineLocal.value,
    form.collectFields.map((field) => ({ ...field, rules: { ...field.rules } })),
    { ...form.fileRules, renameFields: [...form.fileRules.renameFields], allowedExtensions: [...form.fileRules.allowedExtensions] },
  ],
  () => {
    if (suppressDraftWatch) return;
    draftStatusText.value = '有未保存更改 · 每15秒更新';
  },
  { deep: true }
);

watch(
  () => form.collectFields.map((field) => ({ key: field.key, label: field.label })),
  (fields) => {
    fields.forEach((field) => {
      if (!(field.key in fieldDraftLabels)) fieldDraftLabels[field.key] = field.label;
    });
    Object.keys(fieldDraftLabels).forEach((key) => {
      if (!fields.some((field) => field.key === key)) delete fieldDraftLabels[key];
    });
  },
  { deep: true, immediate: true }
);

watch(
  () => [...form.fileRules.allowedExtensions],
  (values) => {
    form.fileRules.fileType = inferFileType(values);
  },
  { deep: true, immediate: true }
);

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick);
  await loadPublicConfig();
  loadLocalTemplates();
  await loadTemplates();
  if (isEditing.value) {
    await loadAssignment();
  } else {
    restoreDraft();
    if (!noDeadline.value && !deadlineLocal.value) deadlineLocal.value = getTodayEndDatetimeLocal();
  }
  autosaveTimer = window.setInterval(() => saveDraftNow(), AUTOSAVE_INTERVAL_MS);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  if (autosaveTimer) window.clearInterval(autosaveTimer);
});
</script>
