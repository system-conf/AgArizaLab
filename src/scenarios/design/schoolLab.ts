// Design brief 3 — school computer labs (docs/DESIGN_EXERCISES.md §4): three classrooms, each in its
// own VLAN and subnet from the school's address plan, a teacher PC that reaches every classroom,
// DHCP per classroom and a single router (router-on-a-stick, or an L3 switch instead).
import type { DesignExerciseDefinition } from '../../domain'
import {
  accessPorts,
  defaultRouteVia,
  dhcpServer,
  dnsProxy,
  lanPool,
  routes,
  subInterfaces,
  trunkPorts,
  vlans,
  wanPort,
} from './deviceSetup'
import { customerLocks, LabBuilder } from './labBuilder'

const SEED = 303
const BUDGET = 2500

/** Classrooms: VLAN, subnet (first three octets), student PCs, zone position. */
const CLASSROOMS = [
  { id: 'classA', vlan: 10, prefix: '10.10.10', pcs: ['a1', 'a2'], x: 20 },
  { id: 'classB', vlan: 20, prefix: '10.10.20', pcs: ['b1', 'b2'], x: 340 },
  { id: 'classC', vlan: 30, prefix: '10.10.30', pcs: ['c1', 'c2'], x: 660 },
] as const
const TEACHER = { vlan: 40, prefix: '10.10.40' }
const STUDENTS = CLASSROOMS.flatMap((room) => [...room.pcs])
const VLAN_DATABASE = [
  { id: 10, name: 'CLASS-A' },
  { id: 20, name: 'CLASS-B' },
  { id: 30, name: 'CLASS-C' },
  { id: 40, name: 'TEACHERS' },
]

/** ISP, the teacher PC in the IT room and two student PCs per classroom; zones per room. */
function customer(): LabBuilder {
  const lab = new LabBuilder(SEED)
    .zone('itRoom', { x: 480, y: 20 }, { width: 460, height: 280 }, 'purple')
    .add('internetCloud', 'isp', { x: 240, y: 40 })
    .add('pc', 'teacher', { x: 760, y: 190 })
  for (const room of CLASSROOMS) {
    lab.zone(room.id, { x: room.x, y: 340 }, { width: 300, height: 260 }, 'blue').addRow('pc', room.pcs, { x: room.x + 30, y: 490 }, 130)
  }
  return lab
}

/**
 * Router-on-a-stick: router Gi0/0 trunk with one sub-interface (gateway + DHCP pool) per VLAN; a
 * 16-port switch in the IT room trunks to an 8-port switch per classroom.
 */
function reference(): LabBuilder {
  const lab = customer()
    .add(
      'router2Port',
      'router',
      { x: 560, y: 60 },
      subInterfaces('Gi0/0', [...CLASSROOMS, TEACHER].map((network) => ({ vlan: network.vlan, address: `${network.prefix}.1` }))),
      wanPort('Gi0/1'),
      routes([defaultRouteVia('Gi0/1')]),
      dhcpServer([...CLASSROOMS.map((room) => lanPool(room.id, room.prefix)), lanPool('teachers', TEACHER.prefix)]),
      dnsProxy(),
    )
    .add('switch16', 'coreSwitch', { x: 560, y: 190 }, vlans(VLAN_DATABASE), trunkPorts(['Fa0/1', 'Fa0/2', 'Fa0/3', 'Fa0/4']), accessPorts(['Fa0/5'], TEACHER.vlan))
    .cable('wan', ['isp', 'eth0'], ['router', 'Gi0/1'])
    .cable('routerTrunk', ['router', 'Gi0/0'], ['coreSwitch', 'Fa0/1'])
    .cable('teacherLink', ['teacher', 'eth0'], ['coreSwitch', 'Fa0/5'])
  CLASSROOMS.forEach((room, index) => {
    const switchId = `${room.id}Switch`
    lab
      .add('switch8', switchId, { x: room.x + 100, y: 380 }, vlans(VLAN_DATABASE.filter((entry) => entry.id === room.vlan)), trunkPorts(['Fa0/8']), accessPorts(['Fa0/1', 'Fa0/2'], room.vlan))
      .cable(`${room.id}Trunk`, ['coreSwitch', `Fa0/${index + 2}`], [switchId, 'Fa0/8'])
    room.pcs.forEach((pc, pcIndex) => lab.cable(`${pc}Link`, [pc, 'eth0'], [switchId, `Fa0/${pcIndex + 1}`]))
  })
  return lab
}

export function schoolLabBrief(): DesignExerciseDefinition {
  const start = customer().build()
  return {
    id: 'schoolLab',
    order: 3,
    setting: 'school',
    lab: start,
    locks: customerLocks(start.state),
    groups: [
      ...CLASSROOMS.map((room) => ({ id: room.id, name: room.id, deviceIds: [...room.pcs] })),
      { id: 'students', name: 'students', deviceIds: STUDENTS },
      { id: 'teacher', name: 'teacher', deviceIds: ['teacher'] },
      { id: 'everyone', name: 'everyone', deviceIds: [...STUDENTS, 'teacher'] },
    ],
    requirements: [
      ...CLASSROOMS.map((room) => ({ id: `${room.id}Plan`, condition: { type: 'addressPlan' as const, group: room.id, prefix: `${room.prefix}.0/24` } })),
      { id: 'studentsDhcp', condition: { type: 'dhcpServes', group: 'students' } },
      { id: 'teacherReachesClasses', condition: { type: 'reachable', fromGroup: 'teacher', toGroup: 'students' } },
      { id: 'everyoneOnline', condition: { type: 'internet', group: 'everyone' } },
      { id: 'everyoneDns', condition: { type: 'resolves', group: 'everyone', name: 'google.com' } },
      { id: 'teacherSeparate', hidden: true, condition: { type: 'separateSubnets', groupA: 'teacher', groupB: 'students' } },
      { id: 'oneRouter', condition: { type: 'maxDevices', kind: 'router', count: 1 } },
      { id: 'budget', condition: { type: 'maxCost', amount: BUDGET } },
    ],
    budget: BUDGET,
    allowedModels: { categories: ['routers', 'switches'] },
    reference: reference().build(),
    reviewHints: [
      { id: 'presentation' },
      { id: 'routerOnAStick' },
      { id: 'trunks', requirementId: 'teacherReachesClasses' },
      { id: 'poolPerVlan', requirementId: 'studentsDhcp' },
      { id: 'teacherVlan', requirementId: 'teacherSeparate' },
    ],
  }
}
