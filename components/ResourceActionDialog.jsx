import { Building2, ShieldCheck, X } from "lucide-react"
import { formatStatus } from "../dashboard-format"

export default function ResourceActionDialog({
  resourceAction,
  resourceActionDraft,
  closeResourceControl,
  submitResourceControl,
  setResourceActionDraft,
  tradePartners,
  openTradePartnerDirectory,
  submitting,
  ot,
}) {
  return (
    <div className="modal-backdrop" role="presentation">
          <section
            className="modal resource-control-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-control-title"
            data-testid="resource-control-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Retained resource control</p>
                <h2 id="resource-control-title">{resourceAction.label}</h2>
                <p>
                  {resourceAction.item.jobTitle} /{' '}
                  {resourceAction.material?.name ||
                    resourceAction.procurementOrder?.supplier ||
                    resourceActionDraft.workerName ||
                    'Resource record'}
                </p>
              </div>
              <button className="icon-button" aria-label="Close resource control" onClick={closeResourceControl}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitResourceControl}>
              <div className="form-grid">
                <div className="field-record-context form-span">
                  <span>Queue state</span>
                  <strong>{formatStatus(resourceAction.item.workforceStatus || resourceAction.item.inventoryStatus)}</strong>
                  <p>{resourceAction.action.label}</p>
                </div>

                {['complete_worker_orientation', 'prepare_site_access'].includes(resourceAction.action.type) ? (
                  <>
                    <label>
                      Worker name
                      <input
                        required
                        value={resourceActionDraft.workerName}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, workerName: event.target.value })}
                      />
                    </label>
                    <label>
                      Company
                      <input
                        required
                        value={resourceActionDraft.company}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, company: event.target.value })}
                      />
                    </label>
                    {resourceAction.action.type === 'complete_worker_orientation' ? (
                      <label className="form-span">
                        Orientation verification reference
                        <input
                          required
                          value={resourceActionDraft.reference}
                          onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, reference: event.target.value })}
                          placeholder="Induction record, credential, or signed evidence reference"
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}

                {resourceAction.action.type === 'record_time_log' ? (
                  <>
                    <label>
                      Worker name
                      <input
                        required
                        value={resourceActionDraft.workerName}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, workerName: event.target.value })}
                      />
                    </label>
                    <label>
                      Work date
                      <input
                        required
                        type="date"
                        value={resourceActionDraft.workDate}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, workDate: event.target.value })}
                      />
                    </label>
                    <label>
                      Hours
                      <input
                        required
                        type="number"
                        min="0.25"
                        max="24"
                        step="0.25"
                        value={resourceActionDraft.hours}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, hours: event.target.value })}
                      />
                    </label>
                    <label>
                      Hourly rate (EUR)
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={resourceActionDraft.rate}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, rate: event.target.value })}
                      />
                    </label>
                    <label>
                      Cost code
                      <input
                        value={resourceActionDraft.costCode}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, costCode: event.target.value })}
                      />
                    </label>
                    <label>
                      Time evidence reference
                      <input
                        value={resourceActionDraft.reference}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, reference: event.target.value })}
                        placeholder="Timesheet, field report, or supervisor reference"
                      />
                    </label>
                  </>
                ) : null}

                {resourceAction.action.type === 'review_material_status' ? (
                  <>
                    <label>
                      Internal state
                      <select
                        value={resourceActionDraft.materialStatus}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, materialStatus: event.target.value })}
                      >
                        <option value="needed">Needed / unavailable</option>
                        <option value="low_stock">Low stock</option>
                        <option value="available">Available</option>
                        <option value="received">Received</option>
                        <option value="allocated">Allocated to job</option>
                        <option value="loaded">Loaded for dispatch</option>
                        <option value="used">Used on job</option>
                      </select>
                    </label>
                    <label>
                      Verified quantity
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={resourceActionDraft.availableQuantity}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, availableQuantity: event.target.value })}
                      />
                    </label>
                    <label>
                      Storage or job location
                      <input
                        value={resourceActionDraft.location}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, location: event.target.value })}
                        placeholder="Warehouse bay, vehicle, or job area"
                      />
                    </label>
                    <label>
                      Expected availability (internal estimate)
                      <input
                        type="datetime-local"
                        value={resourceActionDraft.expectedAvailableAt}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, expectedAvailableAt: event.target.value })}
                      />
                    </label>
                    <p className="form-hint form-span">An estimate can shift this task and dependent work. It is not a supplier order or customer commitment.</p>
                    <label>
                      Verification reference
                      <input
                        required
                        value={resourceActionDraft.reference}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, reference: event.target.value })}
                        placeholder="Delivery note, count sheet, or inspection reference"
                      />
                    </label>
                  </>
                ) : null}

                {resourceAction.action.type === 'request_procurement_approval' ? (
                  <>
                    <label className="form-span">
                      Trade partner
                      <select
                        required
                        value={resourceActionDraft.tradePartnerId}
                        onChange={(event) => {
                          const partner = tradePartners.find((candidate) => candidate.id === event.target.value)
                          setResourceActionDraft({
                            ...resourceActionDraft,
                            tradePartnerId: partner?.id || '',
                            supplier: partner?.name || '',
                          })
                        }}
                      >
                        <option value="">Select a retained supplier</option>
                        {tradePartners
                          .filter((partner) => partner.status !== 'retired')
                          .map((partner) => (
                            <option key={partner.id} value={partner.id}>
                              {partner.name} / {formatStatus(partner.compliance?.status || 'needs_review')}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="partner-selection-note form-span">
                      <p>
                        {resourceActionDraft.tradePartnerId
                          ? 'Compliance is checked again when an approver resolves this request.'
                          : 'A retained partner with current registration, tax, and required safety evidence is mandatory.'}
                      </p>
                      <button type="button" className="secondary-button" onClick={openTradePartnerDirectory}>
                        <Building2 size={15} />
                        Manage trade partners
                      </button>
                    </div>
                    <label>
                      Order value (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={resourceActionDraft.amount}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      Required by
                      <input
                        required
                        type="date"
                        value={resourceActionDraft.requiredBy}
                        onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, requiredBy: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                <label className="form-span">
                  Internal evidence and notes
                  <textarea
                    required
                    value={resourceActionDraft.notes}
                    onChange={(event) => setResourceActionDraft({ ...resourceActionDraft, notes: event.target.value })}
                    placeholder="Record what was checked, by whom, and what this status can safely be used for."
                  />
                </label>
                <p className="workflow-note form-span">
                  This screen changes retained internal evidence only. It cannot clear site access without approval, contact a worker or
                  supplier, place an order, commit spend, or submit payroll.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeResourceControl}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    !resourceActionDraft.notes.trim() ||
                    (resourceAction.action.type === 'request_procurement_approval' &&
                      (!resourceActionDraft.tradePartnerId || !(Number(resourceActionDraft.amount) > 0) || !resourceActionDraft.requiredBy))
                  }
                >
                  <ShieldCheck size={16} />
                  {submitting
                    ? ot('Recording...')
                    : resourceAction.action.type === 'complete_worker_orientation'
                      ? 'Request orientation approval'
                      : resourceAction.action.type === 'prepare_site_access'
                        ? 'Create access gate'
                        : resourceAction.action.type === 'request_procurement_approval'
                          ? 'Request procurement approval'
                          : 'Record internal evidence'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}
