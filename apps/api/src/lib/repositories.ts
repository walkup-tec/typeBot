import { FlowRepository } from "../flows/flow.repository";
import { AttendantRepository } from "../attendants/attendant.repository";
import { LabelRepository } from "../labels/label.repository";
import { PriorityRepository } from "../priorities/priority.repository";
import { KanbanRepository } from "../kanban/kanban.repository";
import { TenantRepository } from "../tenants/tenant.repository";
import { QueueRepository } from "../queue/queue.repository";

/** Instâncias únicas para manter cache em memória alinhado entre rotas. */
export const flowRepository = new FlowRepository();
export const tenantRepository = new TenantRepository();
export const attendantRepository = new AttendantRepository();
export const labelRepository = new LabelRepository();
export const priorityRepository = new PriorityRepository();
export const kanbanRepository = new KanbanRepository();
export const queueRepository = new QueueRepository();
