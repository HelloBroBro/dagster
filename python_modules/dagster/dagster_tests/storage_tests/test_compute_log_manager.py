import tempfile
from contextlib import contextmanager
from typing import IO, Generator, Optional, Sequence

import dagster._check as check
from dagster import job, op
from dagster._core.instance import DagsterInstance, InstanceRef, InstanceType
from dagster._core.launcher import DefaultRunLauncher
from dagster._core.run_coordinator import DefaultRunCoordinator
from dagster._core.storage.captured_log_manager import (
    CapturedLogContext,
    CapturedLogData,
    CapturedLogManager,
    CapturedLogMetadata,
    CapturedLogSubscription,
    ComputeIOType,
)
from dagster._core.storage.compute_log_manager import ComputeLogManager
from dagster._core.storage.event_log import SqliteEventLogStorage
from dagster._core.storage.root import LocalArtifactStorage
from dagster._core.storage.runs import SqliteRunStorage
from dagster._core.test_utils import environ, instance_for_test


def test_compute_log_manager_instance():
    with instance_for_test() as instance:
        assert instance.compute_log_manager
        assert instance.compute_log_manager._instance  # noqa: SLF001


class BrokenCapturedLogManager(CapturedLogManager, ComputeLogManager):
    def __init__(self, fail_on_setup=False, fail_on_teardown=False):
        self._fail_on_setup = check.opt_bool_param(fail_on_setup, "fail_on_setup")
        self._fail_on_teardown = check.opt_bool_param(fail_on_teardown, "fail_on_teardown")

    @contextmanager
    def capture_logs(self, log_key: Sequence[str]) -> Generator[CapturedLogContext, None, None]:
        if self._fail_on_setup:
            raise Exception("fail on setup")
        yield CapturedLogContext(log_key=log_key)
        if self._fail_on_teardown:
            raise Exception("fail on teardown")

    @contextmanager
    def open_log_stream(
        self, log_key: Sequence[str], io_type: ComputeIOType
    ) -> Generator[Optional[IO], None, None]:
        yield None

    def is_capture_complete(self, log_key: Sequence[str]) -> bool:
        return True

    def get_log_data(
        self,
        log_key: Sequence[str],
        cursor: Optional[str] = None,
        max_bytes: Optional[int] = None,
    ) -> CapturedLogData:
        return CapturedLogData(log_key=log_key)

    def get_log_metadata(self, log_key: Sequence[str]) -> CapturedLogMetadata:
        return CapturedLogMetadata()

    def delete_logs(
        self, log_key: Optional[Sequence[str]] = None, prefix: Optional[Sequence[str]] = None
    ):
        pass

    def subscribe(
        self, log_key: Sequence[str], cursor: Optional[str] = None
    ) -> CapturedLogSubscription:
        return CapturedLogSubscription(self, log_key, cursor)

    def unsubscribe(self, subscription: CapturedLogSubscription):
        return


@contextmanager
def broken_captured_log_manager_instance(fail_on_setup=False, fail_on_teardown=False):
    with tempfile.TemporaryDirectory() as temp_dir:
        with environ({"DAGSTER_HOME": temp_dir}):
            yield DagsterInstance(
                instance_type=InstanceType.PERSISTENT,
                local_artifact_storage=LocalArtifactStorage(temp_dir),
                run_storage=SqliteRunStorage.from_local(temp_dir),
                event_storage=SqliteEventLogStorage(temp_dir),
                compute_log_manager=BrokenCapturedLogManager(
                    fail_on_setup=fail_on_setup, fail_on_teardown=fail_on_teardown
                ),
                run_coordinator=DefaultRunCoordinator(),
                run_launcher=DefaultRunLauncher(),
                ref=InstanceRef.from_dir(temp_dir),
            )


def _has_setup_exception(execute_result):
    return any(
        [
            "Exception while setting up compute log capture" in str(event)
            for event in execute_result.all_events
        ]
    )


def _has_teardown_exception(execute_result):
    return any(
        [
            "Exception while cleaning up compute log capture" in str(event)
            for event in execute_result.all_events
        ]
    )


@op
def yay(context):
    context.log.info("yay")
    print("HELLOOO")  # noqa: T201
    return "yay"


@op
def boo(context):
    context.log.info("boo")
    print("HELLOOO")  # noqa: T201
    raise Exception("booo")


@job
def yay_job():
    yay()


@job
def boo_job():
    boo()


def test_broken_compute_log_manager():
    with broken_captured_log_manager_instance(fail_on_setup=True) as instance:
        yay_result = yay_job.execute_in_process(instance=instance)
        assert yay_result.success
        assert _has_setup_exception(yay_result)

        boo_result = boo_job.execute_in_process(instance=instance, raise_on_error=False)
        assert not boo_result.success
        assert _has_setup_exception(boo_result)

    with broken_captured_log_manager_instance(fail_on_teardown=True) as instance:
        yay_result = yay_job.execute_in_process(instance=instance)
        assert yay_result.success
        assert _has_teardown_exception(yay_result)

        boo_result = boo_job.execute_in_process(instance=instance, raise_on_error=False)

        assert not boo_result.success
        assert _has_teardown_exception(boo_result)

    with broken_captured_log_manager_instance() as instance:
        yay_result = yay_job.execute_in_process(instance=instance)
        assert yay_result.success
        assert not _has_setup_exception(yay_result)
        assert not _has_teardown_exception(yay_result)

        boo_result = boo_job.execute_in_process(instance=instance, raise_on_error=False)
        assert not boo_result.success
        assert not _has_setup_exception(boo_result)
        assert not _has_teardown_exception(boo_result)
