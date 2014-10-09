// Copyright (c) 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// A send algorithm which adds pacing on top of an another send algorithm.
// It uses the underlying sender's bandwidth estimate to determine the
// pacing rate to be used.  It also takes into consideration the expected
// resolution of the underlying alarm mechanism to ensure that alarms are
// not set too aggressively, and to smooth out variations.

#ifndef NET_QUIC_CONGESTION_CONTROL_PACING_SENDER_H_
#define NET_QUIC_CONGESTION_CONTROL_PACING_SENDER_H_

#include <map>

#include "base/basictypes.h"
#include "base/memory/scoped_ptr.h"
#include "net/quic/congestion_control/send_algorithm_interface.h"
#include "net/quic/quic_bandwidth.h"
#include "net/quic/quic_config.h"
#include "net/quic/quic_protocol.h"
#include "net/quic/quic_time.h"

namespace net {

class NET_EXPORT_PRIVATE PacingSender : public SendAlgorithmInterface {
 public:
  // Create a PacingSender to wrap the specified sender.  |alarm_granularity|
  // indicates to the pacer to send that far into the future, since it should
  // not expect a callback before that time delta.  |initial_packet_burst| is
  // the number of packets sent without pacing after quiescence.
  PacingSender(SendAlgorithmInterface* sender,
               QuicTime::Delta alarm_granularity,
               uint32 initial_packet_burst);
  virtual ~PacingSender();

  // SendAlgorithmInterface methods.
  virtual void SetFromConfig(const QuicConfig& config, bool is_server) override;
  virtual void SetNumEmulatedConnections(int num_connections) override;
  virtual void OnIncomingQuicCongestionFeedbackFrame(
      const QuicCongestionFeedbackFrame& feedback,
      QuicTime feedback_receive_time) override;
  virtual void OnCongestionEvent(bool rtt_updated,
                                 QuicByteCount bytes_in_flight,
                                 const CongestionVector& acked_packets,
                                 const CongestionVector& lost_packets) override;
  virtual bool OnPacketSent(QuicTime sent_time,
                            QuicByteCount bytes_in_flight,
                            QuicPacketSequenceNumber sequence_number,
                            QuicByteCount bytes,
                            HasRetransmittableData is_retransmittable) override;
  virtual void OnRetransmissionTimeout(bool packets_retransmitted) override;
  virtual void RevertRetransmissionTimeout() override;
  virtual QuicTime::Delta TimeUntilSend(
      QuicTime now,
      QuicByteCount bytes_in_flight,
      HasRetransmittableData has_retransmittable_data) const override;
  virtual QuicBandwidth BandwidthEstimate() const override;
  virtual bool HasReliableBandwidthEstimate() const override;
  virtual QuicTime::Delta RetransmissionDelay() const override;
  virtual QuicByteCount GetCongestionWindow() const override;
  virtual bool InSlowStart() const override;
  virtual bool InRecovery() const override;
  virtual QuicByteCount GetSlowStartThreshold() const override;
  virtual CongestionControlType GetCongestionControlType() const override;

 private:
  scoped_ptr<SendAlgorithmInterface> sender_;  // Underlying sender.
  QuicTime::Delta alarm_granularity_;
  uint32 initial_packet_burst_;
  mutable uint32 burst_tokens_;
  // Send time of the last packet considered delayed.
  QuicTime last_delayed_packet_sent_time_;
  QuicTime next_packet_send_time_;  // When can the next packet be sent.
  mutable bool was_last_send_delayed_;  // True when the last send was delayed.
  bool has_valid_rtt_;  // True if we have at least one RTT update.

  DISALLOW_COPY_AND_ASSIGN(PacingSender);
};

}  // namespace net

#endif  // NET_QUIC_CONGESTION_CONTROL_PACING_SENDER_H_
