import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle } from '@/components/icons/antIconCompat';

import { Button } from '../../components/ui-shared/Button';
import { signatureApi, type PublicSignatureView, type SignatureSnapshotRow } from '../../lib/api/project';

import { t } from '@/i18n/translate';

const statusText = (status?: SignatureSnapshotRow['status']) => {
    if (status === 'YES') return t('projects.delivery.yes');
    if (status === 'NO') return t('projects.delivery.no');
    if (status === 'NA') return t('projects.delivery.na');
    return null;
};
const statusTone = (status?: SignatureSnapshotRow['status']) =>
    status === 'YES' ? 'bg-emerald-50 text-emerald-700' : status === 'NO' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600';

export const ReportSigningPage = () => {
    const { token } = useParams();
    const [view, setView] = useState<PublicSignatureView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState<'signed' | 'unsigned' | null>(null);
    const [bottomPopup, setBottomPopup] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hasInk, setHasInk] = useState(false);
    const drawing = useRef(false);

    useEffect(() => {
        void (async () => {
            if (!token) return;
            try {
                const data = await signatureApi.publicGet(token);
                setView(data);
                if (data.status === 'SIGNED') setDone('signed');
            } catch (e: any) {
                setError(e?.response?.data?.error || t('signatures.public.invalidLink'));
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
    }, [view, done]);

    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
    };
    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasInk(false);
    };

    const submit = async (withSignature: boolean) => {
        if (!token) return;
        const canvas = canvasRef.current;
        const signature = withSignature && hasInk && canvas ? canvas.toDataURL('image/png') : null;
        if (withSignature && !signature) return toast.error(t('signatures.public.pleaseSign'));
        setSaving(true);
        try {
            const res = await signatureApi.publicSign(token, signature);
            if (res.signed) {
                setDone('signed');
            } else {
                setDone('unsigned');
                setBottomPopup(true); // bottom popup (15px radius) for unsigned submit
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('signatures.public.submitError'));
        } finally {
            setSaving(false);
        }
    };

    const snapshot = view?.snapshot;

    return (
        <div className="min-h-screen bg-slate-100 py-8 px-4">
            <div className="mx-auto max-w-3xl">
                <div className="mb-4 text-center">
                    <div className="text-[20px] font-bold text-[#272f67]">offiTec</div>
                    <div className="text-[12px] text-slate-500">Heating · Cooling</div>
                </div>

                {loading ? (
                    <div className="h-64 animate-pulse rounded-2xl bg-white" />
                ) : error ? (
                    <div className="rounded-2xl bg-white p-8 text-center text-[13px] text-rose-700 shadow-sm">{error}</div>
                ) : done === 'signed' ? (
                    <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
                        <CheckCircle size={40} className="mx-auto mb-2 text-emerald-600" />
                        <div className="text-[15px] font-semibold text-slate-900">{t('signatures.public.signedThanks')}</div>
                        <div className="mt-1 text-[12.5px] text-slate-500">{t('signatures.public.signedSub')}</div>
                    </div>
                ) : (
                    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm sm:p-7">
                        <div>
                            <div className="text-[16px] font-semibold text-slate-900">{snapshot?.title || view?.title || t('signatures.public.report')}</div>
                            <div className="mt-0.5 text-[12.5px] text-slate-500">
                                {[snapshot?.customerName, snapshot?.projectName].filter(Boolean).join(' · ')}
                            </div>
                        </div>

                        {snapshot?.meta && snapshot.meta.length > 0 && (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {snapshot.meta.map((m, i) => (
                                    <div key={i} className="rounded-lg border border-slate-200 px-3 py-1.5">
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{m.label}</div>
                                        <div className="text-[12.5px] text-slate-800">{m.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {(snapshot?.sections || []).map((section, si) => (
                            <div key={si} className="overflow-hidden rounded-lg border border-slate-200">
                                {section.heading && (
                                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">{section.heading}</div>
                                )}
                                <table className="w-full text-[12px]">
                                    <tbody className="divide-y divide-slate-100">
                                        {section.rows.map((row, ri) => (
                                            <tr key={ri}>
                                                <td className="px-3 py-1.5 text-slate-700">{row.label}</td>
                                                {row.status !== undefined && (
                                                    <td className="w-24 px-3 py-1.5 text-right">
                                                        {statusText(row.status) && <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${statusTone(row.status)}`}>{statusText(row.status)}</span>}
                                                    </td>
                                                )}
                                                {row.value !== undefined && <td className="w-32 px-3 py-1.5 text-right text-slate-500">{row.value}</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}

                        {snapshot?.notes && <div className="rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{snapshot.notes}</div>}

                        {snapshot?.images && snapshot.images.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                {snapshot.images.map((img, i) => (
                                    <a key={i} href={img} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200">
                                        <img src={img} alt="" className="h-full w-full object-cover" />
                                    </a>
                                ))}
                            </div>
                        )}

                        <div>
                            <div className="mb-1 text-[12px] font-semibold text-slate-700">{t('signatures.public.signHere')}</div>
                            <canvas
                                ref={canvasRef}
                                width={900}
                                height={240}
                                className="h-[200px] w-full touch-none rounded-lg border border-slate-300 bg-white"
                                onPointerDown={(event) => {
                                    drawing.current = true;
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    const ctx = event.currentTarget.getContext('2d');
                                    const p = point(event);
                                    ctx?.beginPath();
                                    ctx?.moveTo(p.x, p.y);
                                }}
                                onPointerMove={(event) => {
                                    if (!drawing.current) return;
                                    const ctx = event.currentTarget.getContext('2d');
                                    const p = point(event);
                                    ctx?.lineTo(p.x, p.y);
                                    ctx?.stroke();
                                    setHasInk(true);
                                }}
                                onPointerUp={() => { drawing.current = false; }}
                                onPointerCancel={() => { drawing.current = false; }}
                            />
                            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                                <Button variant="ghost" onClick={clear}>{t('common.clear')}</Button>
                                <Button variant="secondary" loading={saving} onClick={() => void submit(false)}>{t('signatures.public.submitUnsigned')}</Button>
                                <Button variant="primary" icon={<CheckCircle size={13} />} loading={saving} onClick={() => void submit(true)}>{t('signatures.public.signSubmit')}</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom popup (border-radius 15px) shown after an unsigned submission */}
            {bottomPopup && (
                <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
                    <div
                        className="w-full max-w-xl border border-slate-200 bg-white px-5 py-4 shadow-xl"
                        style={{ borderRadius: '15px' }}
                    >
                        <div className="flex items-start gap-3">
                            <CheckCircle size={20} className="mt-0.5 shrink-0 text-amber-500" />
                            <div className="flex-1">
                                <div className="text-[13.5px] font-semibold text-slate-900">{t('signatures.public.savedUnsignedTitle')}</div>
                                <div className="mt-0.5 text-[12px] text-slate-500">{t('signatures.public.savedUnsignedBody')}</div>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => setBottomPopup(false)}>{t('common.close')}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportSigningPage;
