import { access, mkdir, mkdtemp, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  AgentSuggestionSchema,
  CreationPlanSchema,
  GeneratedOutputManifestSchema,
  type AgentSuggestion,
  type CreationPlan,
  type GeneratedAgent,
  type GeneratedOutputManifest,
} from '../../shared/schemas'

export function defaultOutputDestination(homeDirectory = os.homedir()): string {
  return path.join(homeDirectory, 'Documents', 'Turnstone', 'Agents')
}

export function sanitizeFolderName(name: string): string {
  const withoutControlCharacters = [...name.normalize('NFKD')]
    .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
  const sanitized = withoutControlCharacters
    .replace(/\p{Mark}/gu, '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 64)
    .replace(/[. -]+$/g, '')

  return sanitized || 'Agent'
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export async function planAgentCreation(
  rawAgents: AgentSuggestion[],
  destination: string,
): Promise<CreationPlan> {
  const agents = rawAgents.map((agent) => AgentSuggestionSchema.parse(agent))
  const resolvedDestination = path.resolve(destination)
  const reserved = new Set<string>()
  const planned = []

  for (const agent of agents) {
    const base = sanitizeFolderName(agent.name)
    let folderName = base
    let suffix = 2
    let collisionResolved = false

    while (
      reserved.has(folderName.toLocaleLowerCase()) ||
      (await exists(path.join(resolvedDestination, folderName)))
    ) {
      const ending = `-${suffix}`
      folderName = `${base.slice(0, 64 - ending.length)}${ending}`
      suffix += 1
      collisionResolved = true
    }
    reserved.add(folderName.toLocaleLowerCase())

    planned.push({
      agentId: agent.id,
      name: agent.name,
      folderName,
      path: path.join(resolvedDestination, folderName),
      files: agent.brainFiles.map((file) => file.name),
      collisionResolved,
    })
  }

  return CreationPlanSchema.parse({ destination: resolvedDestination, agents: planned })
}

async function writeAgent(
  plan: CreationPlan['agents'][number],
  agent: AgentSuggestion,
  destination: string,
): Promise<GeneratedAgent> {
  let stagingPath: string | null = null
  let reservedTarget = false
  try {
    if (plan.name !== agent.name) throw new Error('The Agent changed after confirmation.')
    if (await exists(plan.path))
      throw new Error('The destination changed; review the folder plan again.')

    stagingPath = await mkdtemp(path.join(destination, '.turnstone-agent-'))
    for (const file of agent.brainFiles) {
      await writeFile(path.join(stagingPath, file.name), file.content, {
        encoding: 'utf8',
        flag: 'wx',
      })
    }

    await mkdir(plan.path)
    reservedTarget = true
    for (const file of agent.brainFiles) {
      await rename(path.join(stagingPath, file.name), path.join(plan.path, file.name))
    }
    await rmdir(stagingPath)
    stagingPath = null

    return {
      agentId: agent.id,
      folderName: plan.folderName,
      path: plan.path,
      files: agent.brainFiles.map((file) => path.join(plan.path, file.name)),
      status: 'created',
      error: null,
    }
  } catch (error) {
    if (stagingPath) await rm(stagingPath, { recursive: true, force: true })
    if (reservedTarget) await rm(plan.path, { recursive: true, force: true })
    return {
      agentId: agent.id,
      folderName: plan.folderName,
      path: plan.path,
      files: [],
      status: 'error',
      error: error instanceof Error ? error.message : 'Could not create this Agent.',
    }
  }
}

export async function createAgentFolders(
  rawPlan: CreationPlan,
  rawAgents: AgentSuggestion[],
): Promise<GeneratedOutputManifest> {
  const plan = CreationPlanSchema.parse(rawPlan)
  const agents = rawAgents.map((agent) => AgentSuggestionSchema.parse(agent))
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]))

  await mkdir(plan.destination, { recursive: true })
  const generated: GeneratedAgent[] = []
  for (const plannedAgent of plan.agents) {
    const agent = agentsById.get(plannedAgent.agentId)
    if (!agent) {
      generated.push({
        agentId: plannedAgent.agentId,
        folderName: plannedAgent.folderName,
        path: plannedAgent.path,
        files: [],
        status: 'error',
        error: 'The confirmed Agent is no longer available.',
      })
      continue
    }
    generated.push(await writeAgent(plannedAgent, agent, plan.destination))
  }

  return GeneratedOutputManifestSchema.parse({ destination: plan.destination, agents: generated })
}
