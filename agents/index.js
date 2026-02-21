/**
 * AI Marketing Team Orchestrator
 * 
 * Главная система маркетинговой команды агентов для ЮрШтаб AI
 * Координирует работу 6 субагентов под руководством CMO
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Конфигурация агентов
export const AGENTS = {
  cmo: {
    name: 'CMO',
    displayName: 'Маркетинг Директор',
    role: 'Главный маркетолог и координатор команды',
    prompt: readFileSync(join(__dirname, 'cmo', 'SKILL.md'), 'utf-8'),
    subAgents: ['brand_strategist', 'market_researcher', 'content_manager', 'growth_marketer', 'product_marketer', 'social_media_manager']
  },
  brand_strategist: {
    name: 'Brand Strategist',
    displayName: 'Бренд Стратег',
    role: 'Бренд и позиционирование',
    prompt: readFileSync(join(__dirname, 'brand_strategist', 'SKILL.md'), 'utf-8')
  },
  market_researcher: {
    name: 'Market Researcher',
    displayName: 'Маркетолог-Исследователь',
    role: 'Исследования рынка',
    prompt: readFileSync(join(__dirname, 'market_researcher', 'SKILL.md'), 'utf-8')
  },
  content_manager: {
    name: 'Content Manager',
    displayName: 'Контент Менеджер',
    role: 'Контент-маркетинг',
    prompt: readFileSync(join(__dirname, 'content_manager', 'SKILL.md'), 'utf-8')
  },
  growth_marketer: {
    name: 'Growth Marketer',
    displayName: 'Growth Маркетолог',
    role: 'Лидогенерация и рост',
    prompt: readFileSync(join(__dirname, 'growth_marketer', 'SKILL.md'), 'utf-8')
  },
  product_marketer: {
    name: 'Product Marketer',
    displayName: 'Продуктовый Маркетолог',
    role: 'Продуктовый маркетинг',
    prompt: readFileSync(join(__dirname, 'product_marketer', 'SKILL.md'), 'utf-8')
  },
  social_media_manager: {
    name: 'Social Media Manager',
    displayName: 'SMM Менеджер',
    role: 'Соцсети и community',
    prompt: readFileSync(join(__dirname, 'social_media_manager', 'SKILL.md'), 'utf-8')
  }
};

// Продуктовый контекст
export const PRODUCT_CONTEXT = {
  name: 'ЮрШтаб AI',
  description: 'Юридическая операционка с ИИ для SMB',
  persona: 'Младший Юрист AI 24/7',
  positioning: 'Мы не заменяем юристов. Мы снимаем рутину, ускоряем анализ и удерживаем сроки под контролем.',
  targetAudience: 'Российские SMB, собственники бизнеса, юридические отделы',
  channels: ['Telegram', 'LinkedIn', 'VC.ru', 'YouTube', 'Email'],
  keyPains: [
    'Юридическая рутина отнимает время',
    'Пропускаются сроки',
    'Нет прозрачности для собственника',
    'Дорого нанимать штатных юристов'
  ]
};

/**
 * Получить агента по имени
 */
export function getAgent(agentName) {
  return AGENTS[agentName] || null;
}

/**
 * Получить всех субагентов для агента
 */
export function getSubAgents(agentName) {
  const agent = AGENTS[agentName];
  if (!agent || !agent.subAgents) return [];
  return agent.subAgents.map(name => AGENTS[name]);
}

/**
 * Делегировать задачу от одного агента другому
 */
export function delegateTask(fromAgent, toAgent, task) {
  console.log(`[${fromAgent.name}] → [${toAgent.name}]: ${task.description}`);
  return {
    from: fromAgent.name,
    to: toAgent.name,
    task: task,
    status: 'pending'
  };
}

/**
 * Создать промпт для агента с контекстом
 */
export function createPrompt(agentName, customContext = '') {
  const agent = AGENTS[agentName];
  if (!agent) return null;
  
  let prompt = agent.prompt;
  
  if (customContext) {
    prompt += `\n\n## Дополнительный контекст\n${customContext}`;
  }
  
  prompt += `\n\n## Продуктовый контекст\n${JSON.stringify(PRODUCT_CONTEXT, null, 2)}`;
  
  return prompt;
}

export default {
  AGENTS,
  PRODUCT_CONTEXT,
  getAgent,
  getSubAgents,
  delegateTask,
  createPrompt
};
