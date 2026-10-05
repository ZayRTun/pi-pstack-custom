import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, cp, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

let sdkRoot = process.env.PI_SDK_ROOT;
if (!sdkRoot) {
  let current = dirname(realpathSync(execFileSync('which', ['pi'], { encoding: 'utf8' }).trim()));
  while (true) {
    const manifestPath = join(current, 'package.json');
    if (existsSync(manifestPath) && JSON.parse(readFileSync(manifestPath, 'utf8')).name === '@earendil-works/pi-coding-agent') { sdkRoot = current; break; }
    const parent = dirname(current);
    if (parent === current) throw new Error('Cannot locate Pi SDK. Set PI_SDK_ROOT.');
    current = parent;
  }
}
const sdkManifest = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8'));
const sdkEntry = resolve(sdkRoot, sdkManifest.exports['.'].import);
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(pathToFileURL(sdkEntry).href);
const require = createRequire(sdkEntry);
const aiRoot = require.resolve.paths('@earendil-works/pi-ai').map(root => join(root, '@earendil-works/pi-ai')).find(root => existsSync(join(root, 'package.json')));
assert.ok(aiRoot, 'Pi host AI package exists');
const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import(pathToFileURL(join(aiRoot, 'dist/providers/faux.js')).href);

const fork = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const durable = process.env.PI_DURABLE_EXTENSION;
const evidence = process.env.PI_EVIDENCE_DIR;
const root = await mkdtemp(join(tmpdir(), 'independent-pstack-'));
const envKeys = ['PI_CODING_AGENT_DIR', 'PI_SUBAGENT_AGENTS', 'PI_SUBAGENT_CONFIG', 'PI_SUBAGENT_STORAGE'];
const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const proofs = [];

async function runCase(name, withPstack, withDurable) {
  const directory = join(root, name);
  const agentDir = join(directory, 'config');
  await mkdir(agentDir, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  delete process.env.PI_SUBAGENT_AGENTS;
  delete process.env.PI_SUBAGENT_CONFIG;
  process.env.PI_SUBAGENT_STORAGE = join(directory, 'runs');
  let source;
  let skill;
  let manifest;
  if (withDurable && !withPstack) {
    await mkdir(join(agentDir, 'agents'));
    source = join(agentDir, 'agents', 'probe.md');
    await writeFile(source, '---\nname: probe\ndescription: Independent probe\ntools: []\n---\nReturn only the requested marker.\n');
  } else if (withDurable) {
    const relocated = join(directory, 'relocated-package');
    await mkdir(join(relocated, 'agents'), { recursive: true });
    await mkdir(join(relocated, 'skills', 'poteto-mode'), { recursive: true });
    source = join(relocated, 'agents', 'poteto-agent.md');
    skill = join(relocated, 'skills', 'poteto-mode', 'SKILL.md');
    manifest = join(relocated, 'package.json');
    await cp(join(fork, 'agents', 'poteto-agent.md'), source);
    await cp(join(fork, 'skills', 'poteto-mode', 'SKILL.md'), skill);
    await cp(join(fork, 'package.json'), manifest);
    await writeFile(join(agentDir, 'durable-subagents.json'), JSON.stringify({ agentDirectories: [join(relocated, 'agents')] }));
  }
  if (source) source = await realpath(source);
  if (skill) skill = await realpath(skill);
  if (manifest) manifest = await realpath(manifest);
  const runtime = await ModelRuntime.create({ authPath: join(directory, 'auth.json'), modelsPath: null, modelsStorePath: join(directory, 'models.json'), refreshOnCreate: false });
  const faux = fauxProvider();
  runtime.registerNativeProvider(faux.provider);
  const extensions = [withPstack && join(fork, 'extensions', 'pstack', 'index.ts'), withDurable && durable].filter(Boolean);
  const settings = SettingsManager.inMemory({ packages: [] });
  const loader = new DefaultResourceLoader({ cwd: directory, agentDir, settingsManager: settings, additionalExtensionPaths: extensions, additionalSkillPaths: withPstack ? [join(fork, 'skills')] : [] });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  assert.equal(loader.getExtensions().extensions.length, extensions.length, 'isolated extension ownership');
  assert.deepEqual(loader.getSkills().diagnostics.filter(d => d.type === 'collision'), []);
  if (withPstack) for (const name of ['pstack-tdd', 'pstack-teach', 'poteto-mode']) assert.equal(loader.getSkills().skills.filter(s => s.name === name).length, 1);
  const manager = SessionManager.create(directory, join(directory, 'sessions'));
  if (withPstack) manager.appendCustomEntry('pstack-mode', { enabled: true });
  const { session } = await createAgentSession({ cwd: directory, agentDir, modelRuntime: runtime, model: faux.getModel(), settingsManager: settings, resourceLoader: loader, sessionManager: manager, thinkingLevel: 'off' });
  try {
    await session.bindExtensions({ mode: 'print' });
    assert.equal(session.getAllTools().filter(t => t.name === 'subagent').length, withDurable ? 1 : 0);
    assert.equal(session.getAllTools().filter(t => t.name === 'set_tasks').length, 0, 'no required Tasks extension');
    const verifyParent = context => {
      const input = JSON.stringify(context);
      if (withPstack) {
        assert.ok(input.includes('Pstack Poteto Mode is enabled for this session.'));
        assert.ok(input.includes(fork + '/skills/poteto-mode/SKILL.md'));
        assert.ok(input.includes('Task tracking is unavailable'));
        assert.ok(input.includes(withDurable ? 'A Sub-agent tool is available' : 'No compatible Sub-agent tool is available'));
      } else assert.ok(!input.includes('Pstack Poteto Mode is enabled for this session.'));
    };
    if (!withDurable) {
      faux.setResponses([context => { verifyParent(context); return fauxAssistantMessage('PSTACK_ALONE'); }]);
    } else if (!withPstack) {
      faux.setResponses([
        context => { verifyParent(context); return fauxAssistantMessage([fauxToolCall('subagent', { agent: 'probe', model: 'inherit-parent', task: 'Return DURABLE_ALONE.' }, { id: 'independent-probe' })], { stopReason: 'toolUse' }); },
        context => { assert.ok(JSON.stringify(context).includes(source)); return fauxAssistantMessage('DURABLE_ALONE'); },
        fauxAssistantMessage('Done.'),
      ]);
    } else {
      faux.setResponses([
        context => { verifyParent(context); return fauxAssistantMessage([fauxToolCall('subagent', { agent: 'poteto-agent', model: 'inherit-parent', task: 'Read your owning skill first, then the owning package.json. Read only those two files. Return FORK_NAME=@zayar/pi-pstack.' }, { id: 'portable-provider' })], { stopReason: 'toolUse' }); },
        context => {
          const input = JSON.stringify(context);
          assert.ok(input.includes(source), 'definition location reaches child');
          assert.ok(input.includes('definition-relative resource reference'));
          assert.ok(input.includes('Do not delegate further.'));
          return fauxAssistantMessage([fauxToolCall('read', { path: skill }, { id: 'owning-skill' })], { stopReason: 'toolUse' });
        },
        context => { assert.ok(JSON.stringify(context).includes('# Poteto mode')); return fauxAssistantMessage([fauxToolCall('read', { path: manifest }, { id: 'owning-package' })], { stopReason: 'toolUse' }); },
        context => { assert.ok(JSON.stringify(context).includes('@zayar/pi-pstack')); return fauxAssistantMessage('FORK_NAME=@zayar/pi-pstack'); },
        fauxAssistantMessage('Done.'),
      ]);
    }
    await session.prompt('Run the isolated compatibility check.');
    let delegated;
    if (withDurable) {
      const result = session.messages.findLast(m => m.role === 'toolResult' && m.toolName === 'subagent');
      assert.ok(result && !result.isError, JSON.stringify(result));
      const dirs = await readdir(join(directory, 'runs'));
      const id = dirs.find(name => /^[a-f0-9]{32}$/.test(name));
      assert.ok(id);
      delegated = JSON.parse(await readFile(join(directory, 'runs', id, 'run.json'), 'utf8'));
      assert.equal(delegated.status, 'succeeded');
      assert.equal(delegated.output, withPstack ? 'FORK_NAME=@zayar/pi-pstack' : 'DURABLE_ALONE');
      assert.equal(delegated.agent.definitionPath, source);
      assert.equal(delegated.agent.tools.includes('set_tasks'), false);
      assert.equal(delegated.agent.tools.includes('subagent'), false);
      assert.deepEqual((delegated.activityLog ?? []).map(call => call.name), withPstack ? ['read', 'read'] : []);
    }
    proofs.push({ name, extensionPaths: loader.getExtensions().extensions.map(e => e.path), providerCalls: faux.state.callCount, paidProviderCalls: 0, delegated: delegated && { status: delegated.status, output: delegated.output, definitionPath: delegated.agent.definitionPath, unavailable: delegated.unavailable, activity: delegated.activityLog } });
    console.log(`PASS: ${name}`);
  } finally { session.dispose(); }
}

try {
  await runCase('pstack-alone', true, false);
  if (durable) {
    await runCase('durable-alone', false, true);
    await runCase('optional-composition-relocated-agent', true, true);
  } else console.log('SKIP: optional provider tests. Set PI_DURABLE_EXTENSION to a compatible Durable entry point.');
  if (evidence) await writeFile(join(evidence, 'independence-matrix.json'), JSON.stringify(proofs, null, 2));
} finally {
  for (const key of envKeys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  await rm(root, { recursive: true, force: true });
}
